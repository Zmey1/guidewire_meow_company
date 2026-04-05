/**
 * verificationPipeline.js
 * Async claim verification — runs AFTER POST /claims/file returns to the client.
 * Steps follow the spec exactly (steps 3-12).
 */

const { getDb } = require('../config/firebase');
const { fetchWeather } = require('./owmService');
const { getRiskScore, predictIncome, fraudCheck } = require('./aiService');
const { checkAndSuspendZoneIfNeeded } = require('./zoneService');
const admin = require('firebase-admin');

function toWholeRupees(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}

/**
 * Main entry point — fire-and-forget from the route handler.
 */
async function verificationPipeline(claimId, worker, policy, zone, darkStore) {
  const db = getDb();
  const claimRef = db.collection('claims').doc(claimId);

  try {
    console.log(`[Pipeline] Starting verification for claim ${claimId}`);

    // ── Step 3: Fetch live data based on trigger_type ────────────────────────
    const claim = (await claimRef.get()).data();
    const { trigger_type } = claim;

    let rainfall_mm = 0, heat_index = 30, aqi = 0;
    let flood_signal = false, severe_flood_signal = false;
    let dispatch_outage = false, zone_restriction = false, unsafe_signal = false;

    if (['heavy_rain', 'extreme_heat'].includes(trigger_type)) {
      const wx = await fetchWeather(zone.lat, zone.lng);
      rainfall_mm = wx.rainfall_mm;
      heat_index = wx.heat_index;
      aqi = wx.aqi;
    }

    if (trigger_type === 'flood') {
      flood_signal = zone.flood_signal || false;
      severe_flood_signal = zone.severe_flood_signal || false;
    }

    if (trigger_type === 'dispatch_outage') {
      dispatch_outage = darkStore.dispatch_outage || false;
    }

    if (trigger_type === 'zone_restriction') {
      zone_restriction = zone.zone_restriction || false;
    }

    if (trigger_type === 'unsafe_area') {
      unsafe_signal = zone.unsafe_signal || false;
    }

    // ── Step 4: POST AI /risk-score ─────────────────────────────────────────
    const riskPayload = {
      zone_id: zone.id,
      rainfall_mm,
      flood_signal,
      severe_flood_signal,
      dispatch_outage,
      heat_index,
      aqi,
      zone_restriction,
      unsafe_signal,
    };
    const { risk_score, tier, expected_loss, breakdown } = await getRiskScore(riskPayload);

    // Store trigger event
    const triggerEventRef = db.collection('trigger_events').doc();
    await triggerEventRef.set({
      zone_id: zone.id,
      trigger_type,
      risk_score,
      tier,
      source: 'rider',
      rainfall_mm,
      heat_index,
      aqi,
      flood_signal,
      severe_flood_signal,
      dispatch_outage,
      unsafe_signal,
      zone_restriction,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    const triggerEventId = triggerEventRef.id;

    // Update claim with trigger_event_id and risk_score
    await claimRef.update({ trigger_event_id: triggerEventId, risk_score });

    // ── Step 5: Risk threshold check ─────────────────────────────────────────
    if (risk_score < 40) {
      await rejectClaim(claimRef, policy, {
        rejection_reason: `Disruption not verified — risk score ${risk_score.toFixed(1)} below threshold of 40`,
        fraud_result: null,
        risk_score,
      });
      return;
    }

    // ── Step 6: Peer consensus ratio ─────────────────────────────────────────
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const peerSnap = await db.collection('claims')
      .where('zone_id', '==', zone.id)
      .where('trigger_type', '==', trigger_type)
      .where('created_at', '>=', thirtyMinAgo)
      .get();

    // Count active shift workers in zone
    const activeWorkersSnap = await db.collection('policies')
      .where('zone_id', '==', zone.id)
      .where('status', '==', 'active')
      .get();

    const filingWorkers = peerSnap.size || 1;
    const totalActive = Math.max(activeWorkersSnap.size, 1);
    const peer_consensus_ratio = Math.min(1.0, filingWorkers / totalActive);

    // ── Step 7: POST AI /predict-income ──────────────────────────────────────
    const now = new Date();
    const windowStart = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2h ago
    const windowEnd = now;

    const incomePayload = {
      weekly_income_band: worker.weekly_income_band,
      tier,
      weekly_hours: worker.weekly_hours || 40,
      shift_slots: policy.shift_slots || [],
      trigger_window_start: windowStart.toISOString(),
      trigger_window_end: windowEnd.toISOString(),
      zone_density_factor: zone.zone_density_factor || 1.0,
      demand_factor: 1.0,
      expected_loss: expected_loss || 0,
      premium_pool: 0,
      expected_claims: 0,
    };

    if (policy.pool_id) {
      const poolDoc = await db.collection('pools').doc(policy.pool_id).get();
      if (poolDoc.exists) {
        const pool = poolDoc.data() || {};
        incomePayload.premium_pool = pool.total_collected || 0;
        incomePayload.expected_claims = pool.total_claimed || 0;
      }
    }
    const { eligible_hours, income_loss, scaled_payout, coverage_ratio } = await predictIncome(incomePayload);

    if ((eligible_hours || 0) <= 0 || (scaled_payout || 0) <= 0) {
      await rejectClaim(claimRef, policy, {
        rejection_reason: 'No covered shift overlap detected in the current disruption window',
        fraud_result: null,
        risk_score,
        income_loss: income_loss || 0,
        scaled_payout: scaled_payout || 0,
        coverage_ratio: coverage_ratio || 0.625,
        uncovered_loss: income_loss || 0,
        eligible_hours: eligible_hours || 0,
        payout_amount: 0,
        peer_consensus_ratio,
      });
      return;
    }

    // ── Step 8: Apply weekly cap ──────────────────────────────────────────────
    const policyRef = db.collection('policies').doc(policy.id);
    const policySnap = await policyRef.get();
    const latestPolicy = policySnap.data();
    const payoutsUsed = toWholeRupees(latestPolicy.payouts_issued_this_week || 0);
    const effectiveCap = toWholeRupees(latestPolicy.effective_weekly_cap || latestPolicy.weekly_cap || 0);
    const remaining = effectiveCap - payoutsUsed;
    const cappedPayout = Math.max(0, Math.min(toWholeRupees(scaled_payout), remaining));
    const uncoveredLoss = Math.max(0, (income_loss || 0) - cappedPayout);

    if (cappedPayout === 0) {
      await rejectClaim(claimRef, policy, {
        rejection_reason: 'Weekly cap reached — no remaining payout allowance',
        fraud_result: null,
        risk_score,
        income_loss: income_loss || 0,
        scaled_payout: scaled_payout || 0,
        coverage_ratio: coverage_ratio || 0.625,
        uncovered_loss: uncoveredLoss,
        eligible_hours,
        payout_amount: 0,
        peer_consensus_ratio,
      });
      return;
    }

    // ── Step 9: POST AI /fraud-check ──────────────────────────────────────────
    const fraudPayload = {
      worker_id: worker.uid,
      zone_id: zone.id,
      trigger_event_id: triggerEventId,
      claim_id: claimId,
      trigger_type,
      peer_consensus_ratio,
      payout_amount: cappedPayout,
    };
    const fraudResult = await fraudCheck(fraudPayload);

    // ── Step 10 / 11: Decision ────────────────────────────────────────────────
    if (fraudResult.decision === 'approved') {
      await approveClaim(db, claimRef, policyRef, worker, policy, {
        risk_score,
        income_loss: income_loss || 0,
        scaled_payout: scaled_payout || 0,
        coverage_ratio: coverage_ratio || 0.625,
        uncovered_loss: uncoveredLoss,
        eligible_hours,
        payout_amount: cappedPayout,
        peer_consensus_ratio,
        fraud_result: fraudResult.fraud_result,
        trigger_event_id: triggerEventId,
      });
    } else {
      const fr = fraudResult.fraud_result;
      let reason = 'Claim flagged by fraud detection';
      if (fr.ring_detected === 'hard') reason = 'Coordinated claim ring detected';
      else if (fr.ring_detected === 'soft') reason = 'Suspicious co-filing pattern detected';
      else if (fr.graph_anomaly_score >= 0.6) reason = 'Anomalous filing pattern detected';
      else if (fr.trust_score_at_check < 0.2) reason = 'Account trust score too low';

      await rejectClaim(claimRef, policy, {
        rejection_reason: reason,
        fraud_result: fr,
        risk_score,
        income_loss: income_loss || 0,
        scaled_payout: scaled_payout || 0,
        coverage_ratio: coverage_ratio || 0.625,
        uncovered_loss: uncoveredLoss,
        eligible_hours,
        payout_amount: cappedPayout,
        peer_consensus_ratio,
        trigger_event_id: triggerEventId,
      });
    }

  } catch (err) {
    console.error(`[Pipeline] Error verifying claim ${claimId}:`, err.message);
    if (err.message.includes('requires an index')) {
      console.error(`[Pipeline] ACTION REQUIRED: Create index for claims collection group. See link in logs if available or use Firebase Console.`);
    }
    await claimRef.update({
      status: 'rejected',
      rejection_reason: 'Verification error — please contact support',
      resolved_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function approveClaim(db, claimRef, policyRef, worker, policy, data) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  const payoutAmount = toWholeRupees(data.payout_amount);

  // Update claim
  batch.update(claimRef, {
    status: 'approved',
    risk_score: data.risk_score,
    income_loss: data.income_loss || 0,
    scaled_payout: data.scaled_payout || 0,
    coverage_ratio: data.coverage_ratio || 0.625,
    uncovered_loss: data.uncovered_loss || 0,
    eligible_hours: data.eligible_hours,
    payout_amount: payoutAmount,
    peer_consensus_ratio: data.peer_consensus_ratio,
    fraud_result: data.fraud_result,
    trigger_event_id: data.trigger_event_id,
    rejection_reason: null,
    resolved_at: now,
  });

  // Increment payouts_issued_this_week on policy
  batch.update(policyRef, {
    payouts_issued_this_week: admin.firestore.FieldValue.increment(payoutAmount),
  });

  // Credit wallet — add to balance
  const walletRef = db.collection('wallets').doc(worker.uid);
  batch.update(walletRef, {
    balance: admin.firestore.FieldValue.increment(payoutAmount),
  });

  await batch.commit();

  // Add transaction to sub-collection
  const walletRef2 = db.collection('wallets').doc(worker.uid);
  await walletRef2.collection('transactions').add({
    type: 'payout',
    amount: payoutAmount,
    description: `Claim approved — ${data.trigger_event_id}`,
    claim_id: claimRef.id,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Update pool (read policy for pool_id)
  if (policy.pool_id) {
    const poolRef = db.collection('pools').doc(policy.pool_id);
    await poolRef.update({
      total_claimed: admin.firestore.FieldValue.increment(payoutAmount),
      surplus: admin.firestore.FieldValue.increment(-payoutAmount),
    });
  }

  await checkAndSuspendZoneIfNeeded(db, policy.zone_id);

  console.log(`[Pipeline] Claim ${claimRef.id} APPROVED — ₹${payoutAmount}`);
}

async function rejectClaim(claimRef, policy, data) {
  await claimRef.update({
    status: 'rejected',
    risk_score: data.risk_score || 0,
    income_loss: data.income_loss || 0,
    scaled_payout: data.scaled_payout || 0,
    coverage_ratio: data.coverage_ratio || 0.625,
    uncovered_loss: data.uncovered_loss || 0,
    eligible_hours: data.eligible_hours || 0,
    payout_amount: data.payout_amount || 0,
    peer_consensus_ratio: data.peer_consensus_ratio || 0,
    fraud_result: data.fraud_result || null,
    trigger_event_id: data.trigger_event_id || null,
    rejection_reason: data.rejection_reason,
    resolved_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`[Pipeline] Claim ${claimRef.id} REJECTED — ${data.rejection_reason}`);
}

module.exports = { verificationPipeline };
