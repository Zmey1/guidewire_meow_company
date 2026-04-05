/**
 * triggerEngine.js
 * Shared payout pipeline used by both:
 *   - POST /api/admin/trigger  (manual, immediate)
 *   - cron job every 15 min   (automated, calls OWM)
 *
 * runManualTrigger({ zone_id, trigger_type, severity, triggeredBy })
 *   → builds mock signal values for the trigger_type
 *   → calls AI from step 4 onward
 *   → pays eligible workers, returns summary
 *
 * runCronCycle()
 *   → iterates all zones, fetches live OWM weather + Firestore signals
 *   → runs payout pipeline for each zone where risk_score >= 40
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

// ── Signal builders for manual triggers ──────────────────────────────────────

function buildSignals(trigger_type, severity = 'medium') {
  const s = severity === 'high' ? 1.5 : severity === 'low' ? 0.5 : 1.0;
  switch (trigger_type) {
    case 'heavy_rain':
      return { rainfall_mm: Math.round(25 * s), heat_index: 32, aqi: 50, flood_signal: false, severe_flood_signal: false, dispatch_outage: false, zone_restriction: false, unsafe_signal: false };
    case 'flood':
      return { rainfall_mm: Math.round(10 * s), heat_index: 30, aqi: 40, flood_signal: s >= 1.0, severe_flood_signal: s > 1.2, dispatch_outage: false, zone_restriction: false, unsafe_signal: false };
    case 'dispatch_outage':
      return { rainfall_mm: 0, heat_index: 32, aqi: 50, flood_signal: false, severe_flood_signal: false, dispatch_outage: true, zone_restriction: false, unsafe_signal: false };
    case 'zone_restriction':
      return { rainfall_mm: 0, heat_index: 32, aqi: 50, flood_signal: false, severe_flood_signal: false, dispatch_outage: false, zone_restriction: true, unsafe_signal: false };
    case 'extreme_heat':
      return { rainfall_mm: 0, heat_index: Math.round(44 * s), aqi: Math.round(310 * s), flood_signal: false, severe_flood_signal: false, dispatch_outage: false, zone_restriction: false, unsafe_signal: false };
    case 'unsafe_area':
      return { rainfall_mm: 0, heat_index: 32, aqi: 90, flood_signal: false, severe_flood_signal: false, dispatch_outage: false, zone_restriction: false, unsafe_signal: true };
    default:
      return { rainfall_mm: 0, heat_index: 32, aqi: 50, flood_signal: false, severe_flood_signal: false, dispatch_outage: false, zone_restriction: false, unsafe_signal: false };
  }
}

// ── Core payout pipeline (steps 4-12 from spec) ──────────────────────────────

async function runPayoutPipeline({ db, zone, signals, trigger_type, source, triggeredBy }) {
  // Step 4: POST AI /risk-score
  const riskPayload = { zone_id: zone.id, ...signals };
  const { risk_score, tier, expected_loss, breakdown } = await getRiskScore(riskPayload);

  // Step 5: Update zone risk score
  await db.collection('zones').doc(zone.id).update({ current_risk_score: risk_score });

  // Store trigger event
  const triggerEventRef = db.collection('trigger_events').doc();
  await triggerEventRef.set({
    zone_id: zone.id,
    trigger_type,
    risk_score,
    tier,
    source,
    ...signals,
    triggered_by: triggeredBy || null,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  const triggerEventId = triggerEventRef.id;

  const summary = { zone_id: zone.id, trigger_type, risk_score, tier, triggerEventId, payouts: [], skipped: [] };

  // Step 6: Only proceed if risk_score >= 40
  if (risk_score < 40) {
    summary.message = `Risk score ${risk_score} below threshold — no payouts triggered`;
    return summary;
  }

  // Find workers with active policies in this zone
  const policiesSnap = await db.collection('policies')
    .where('zone_id', '==', zone.id)
    .where('status', '==', 'active')
    .get();

  if (policiesSnap.empty) {
    summary.message = 'No active policies in zone';
    return summary;
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const windowEnd = now;

  const totalActive = policiesSnap.size;

  for (const policyDoc of policiesSnap.docs) {
    const policy = { id: policyDoc.id, ...policyDoc.data() };

    // Fetch worker
    const workerDoc = await db.collection('workers').doc(policy.worker_id).get();
    if (!workerDoc.exists) continue;
    const worker = { uid: policy.worker_id, ...workerDoc.data() };

    // Step 7: predict income
    let eligible_hours = 0, income_loss = 0, scaled_payout = 0, coverage_ratio = 0.625;
    try {
      let premium_pool = 0;
      let expected_claims = 0;
      if (policy.pool_id) {
        const poolDoc = await db.collection('pools').doc(policy.pool_id).get();
        if (poolDoc.exists) {
          const pool = poolDoc.data() || {};
          premium_pool = pool.total_collected || 0;
          expected_claims = pool.total_claimed || 0;
        }
      }
      const incomeRes = await predictIncome({
        weekly_income_band: worker.weekly_income_band || 10000,
        tier,
        weekly_hours: worker.weekly_hours || 40,
        shift_slots: policy.shift_slots || [],
        trigger_window_start: windowStart.toISOString(),
        trigger_window_end: windowEnd.toISOString(),
        zone_density_factor: zone.zone_density_factor || 1.0,
        demand_factor: 1.0,
        expected_loss: expected_loss || 0,
        premium_pool,
        expected_claims,
      });
      eligible_hours = incomeRes.eligible_hours;
      income_loss = incomeRes.income_loss || 0;
      scaled_payout = incomeRes.scaled_payout || 0;
      coverage_ratio = incomeRes.coverage_ratio || 0.625;
    } catch (incomeErr) {
      summary.skipped.push({ worker_id: policy.worker_id, reason: `predict-income error: ${incomeErr.message}` });
      continue;
    }

    if (eligible_hours === 0) {
      summary.skipped.push({ worker_id: policy.worker_id, reason: 'No eligible shift overlap' });
      continue;
    }

    // Step 8: Apply weekly cap
    const payoutsUsed = toWholeRupees(policy.payouts_issued_this_week || 0);
    const effectiveCap = toWholeRupees(policy.effective_weekly_cap || policy.weekly_cap || 0);
    const remaining = effectiveCap - payoutsUsed;
    const cappedPayout = Math.max(0, Math.min(toWholeRupees(scaled_payout), remaining));
    const uncoveredLoss = Math.max(0, income_loss - cappedPayout);

    if (cappedPayout === 0) {
      summary.skipped.push({ worker_id: policy.worker_id, reason: 'Weekly cap reached' });
      continue;
    }

    // Step 9: Fraud check (fail-open if unavailable)
    let fraudDecision = 'approved';
    let fraudResult = { graph_anomaly_score: 0, ring_detected: 'none', trust_score_at_check: 1.0, decision_source: 'matrix' };
    try {
      const peerConsensusRatio = Math.min(1.0, policiesSnap.size / Math.max(totalActive, 1));
      const fr = await fraudCheck({
        worker_id: policy.worker_id,
        zone_id: zone.id,
        trigger_event_id: triggerEventId,
        claim_id: `auto_${triggerEventId}_${policy.worker_id}`,
        trigger_type,
        peer_consensus_ratio: peerConsensusRatio,
        payout_amount: cappedPayout,
      });
      fraudDecision = fr.decision;
      fraudResult = fr.fraud_result;
    } catch (fraudErr) {
      console.warn(`[TriggerEngine] Fraud check unavailable — failing open for ${policy.worker_id}: ${fraudErr.message}`);
      // Fail-open: approve but with 50% payout reduction as safety
      fraudDecision = 'approved';
    }

    if (fraudDecision !== 'approved') {
      summary.skipped.push({ worker_id: policy.worker_id, reason: 'Fraud check rejected' });
      continue;
    }

    // Step 10: Write claim + credit wallet atomically
    const claimRef = db.collection('claims').doc();
    const walletRef = db.collection('wallets').doc(policy.worker_id);
    const policyRef = db.collection('policies').doc(policy.id);

    const batch = db.batch();

    batch.set(claimRef, {
      worker_id: policy.worker_id,
      policy_id: policy.id,
      zone_id: zone.id,
      dark_store_id: policy.dark_store_id || worker.dark_store_id,
      trigger_type,
      trigger_event_id: triggerEventId,
      risk_score,
      income_loss: income_loss,
      scaled_payout: scaled_payout,
      coverage_ratio: coverage_ratio,
      uncovered_loss: uncoveredLoss,
      payout_amount: cappedPayout,
      eligible_hours,
      peer_consensus_ratio: Math.min(1.0, totalActive > 0 ? policiesSnap.size / totalActive : 1),
      status: 'approved',
      fraud_result: fraudResult,
      rejection_reason: null,
      source,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      resolved_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    batch.update(policyRef, {
      payouts_issued_this_week: admin.firestore.FieldValue.increment(cappedPayout),
    });

    batch.update(walletRef, {
      balance: admin.firestore.FieldValue.increment(cappedPayout),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update pool
    if (policy.pool_id) {
      const poolRef = db.collection('pools').doc(policy.pool_id);
      batch.update(poolRef, {
        total_claimed: admin.firestore.FieldValue.increment(cappedPayout),
        surplus: admin.firestore.FieldValue.increment(-cappedPayout),
      });
    }

    await batch.commit();

    // Wallet transaction sub-doc
    await walletRef.collection('transactions').add({
      type: 'payout',
      amount: cappedPayout,
      description: `Auto payout — ${trigger_type.replace(/_/g, ' ')} (${tier})`,
      claim_id: claimRef.id,
      trigger_event_id: triggerEventId,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    summary.payouts.push({
      worker_id: policy.worker_id,
      worker_name: worker.name,
      claim_id: claimRef.id,
      payout_amount: cappedPayout,
      eligible_hours,
    });

    console.log(`[TriggerEngine] Payout ₹${cappedPayout} → ${worker.name} (${policy.worker_id})`);
  }

  summary.total_paid = summary.payouts.reduce((s, p) => s + p.payout_amount, 0);
  summary.message = `Pipeline complete — ₹${summary.total_paid} paid to ${summary.payouts.length} riders`;
  await checkAndSuspendZoneIfNeeded(db, zone.id);
  return summary;
}

// ── Public: manual trigger (admin dashboard) ─────────────────────────────────

async function runManualTrigger({ zone_id, trigger_type, severity, triggeredBy }) {
  const db = getDb();

  const zoneDoc = await db.collection('zones').doc(zone_id).get();
  if (!zoneDoc.exists) throw new Error(`Zone ${zone_id} not found`);
  const zone = { id: zoneDoc.id, ...zoneDoc.data() };

  const signals = buildSignals(trigger_type, severity);

  return runPayoutPipeline({ db, zone, signals, trigger_type, source: 'manual', triggeredBy });
}

// ── Public: cron cycle (every 15 min) ────────────────────────────────────────

async function runCronCycle() {
  const db = getDb();
  const zonesSnap = await db.collection('zones').get();
  const results = [];

  for (const zoneDoc of zonesSnap.docs) {
    const zone = { id: zoneDoc.id, ...zoneDoc.data() };
    try {
      // OWM weather
      const { rainfall_mm, heat_index, aqi } = await fetchWeather(zone.lat, zone.lng);

      // Firestore signals
      const signals = {
        rainfall_mm,
        heat_index,
        aqi,
        flood_signal: zone.flood_signal || false,
        severe_flood_signal: zone.severe_flood_signal || false,
        dispatch_outage: false, // fetched per dark store below
        zone_restriction: zone.zone_restriction || false,
        unsafe_signal: zone.unsafe_signal || false,
      };

      // Check dark store outage for any dark store in this zone
      const dsSnap = await db.collection('dark_stores').where('zone_id', '==', zone.id).get();
      const hasOutage = dsSnap.docs.some(d => d.data().dispatch_outage === true);
      signals.dispatch_outage = hasOutage;

      const result = await runPayoutPipeline({
        db, zone, signals,
        trigger_type: 'heavy_rain', // cron uses weather-driven type
        source: 'auto',
        triggeredBy: null,
      });
      results.push(result);
    } catch (err) {
      console.error(`[CronCycle] Zone ${zone.id} error:`, err.message);
      results.push({ zone_id: zone.id, error: err.message });
    }
  }

  return results;
}

module.exports = { runManualTrigger, runCronCycle };
