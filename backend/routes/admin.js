const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const { getDb } = require('../config/firebase');
const admin = require('firebase-admin');

// ── GET /api/admin/claims ─────────────────────────────────────────────────

router.get('/claims', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    let query = db.collection('claims').orderBy('created_at', 'desc');

    // Filters
    if (req.query.status) query = query.where('status', '==', req.query.status);
    if (req.query.zone_id) query = query.where('zone_id', '==', req.query.zone_id);
    if (req.query.trigger_type) query = query.where('trigger_type', '==', req.query.trigger_type);

    const snap = await query.limit(200).get();
    const claims = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Enrich with worker names
    const workerIds = [...new Set(claims.map(c => c.worker_id))];
    const workerMap = {};
    await Promise.all(workerIds.map(async uid => {
      const doc = await db.collection('workers').doc(uid).get();
      workerMap[uid] = doc.exists ? doc.data() : {};
    }));

    const enriched = claims.map(c => ({
      ...c,
      worker_name: workerMap[c.worker_id]?.name || 'Unknown',
    }));

    return res.json({ claims: enriched });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/claims/:id/override ──────────────────────────────────

router.post('/claims/:id/override', adminAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'reason is required' });

    const db = getDb();
    const claimRef = db.collection('claims').doc(req.params.id);
    const claimDoc = await claimRef.get();
    if (!claimDoc.exists) return res.status(404).json({ error: 'Claim not found' });

    const claim = claimDoc.data();
    if (claim.status !== 'rejected') {
      return res.status(400).json({ error: 'Can only override rejected claims' });
    }

    const payout = claim.payout_amount || 0;
    const workerId = claim.worker_id;

    const batch = db.batch();

    // Flip claim status
    batch.update(claimRef, {
      status: 'approved',
      rejection_reason: null,
      resolved_at: admin.firestore.FieldValue.serverTimestamp(),
      override_reason: reason,
      override_by: req.uid,
    });

    // Credit wallet
    const walletRef = db.collection('wallets').doc(workerId);
    batch.update(walletRef, {
      balance: admin.firestore.FieldValue.increment(payout),
    });

    await batch.commit();

    // Wallet transaction
    await db.collection('wallets').doc(workerId)
      .collection('transactions').add({
        type: 'payout',
        amount: payout,
        description: `Admin override — ${reason}`,
        claim_id: req.params.id,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

    // Nudge trust+0.1 via AI service if available
    try {
      const { getAuth } = require('../config/firebase');
      const workerDoc = await db.collection('workers').doc(workerId).get();
      // Trust update happens inside Neo4j — fire-and-forget via AI service
      // (AI service exposes no separate trust endpoint; handled by fraud-check internally)
      // Log the override for audit
      console.log(`[Admin Override] Claim ${req.params.id} overridden by ${req.uid}: ${reason}`);
    } catch (_) {}

    return res.json({ success: true, claim_id: req.params.id, payout_credited: payout });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/pools ──────────────────────────────────────────────────

router.get('/pools', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    const snap = await db.collection('pools').orderBy('created_at', 'desc').limit(50).get();
    const pools = snap.docs.map(d => {
      const data = d.data();
      const bcr = data.total_collected ? (data.total_claimed || 0) / data.total_collected : 0;
      return { id: d.id, ...data, bcr };
    });
    return res.json({ pools });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/zones ──────────────────────────────────────────────────

router.get('/zones', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    const zonesSnap = await db.collection('zones').get();
    const zones = zonesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Enrich with active rider count
    const enriched = await Promise.all(zones.map(async z => {
      const activeSnap = await db.collection('policies')
        .where('zone_id', '==', z.id)
        .where('status', '==', 'active')
        .get();

      const poolsSnap = await db.collection('pools')
        .where('zone_id', '==', z.id)
        .get();

      let totalClaimed = 0;
      let totalCollected = 0;
      poolsSnap.forEach(p => {
        const pd = p.data();
        totalClaimed += (pd.total_claimed || 0);
        totalCollected += (pd.total_collected || 0);
      });
      const loss_ratio = totalCollected ? totalClaimed / totalCollected : 0;

      return { ...z, active_riders: activeSnap.size, loss_ratio };
    }));

    return res.json({ zones: enriched });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/zones/:id/signals — toggle Firestore signal flags ────

router.patch('/zones/:id/signals', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    const allowed = ['flood_signal', 'severe_flood_signal', 'unsafe_signal', 'zone_restriction'];
    const updates = {};
    for (const key of allowed) {
      if (typeof req.body[key] === 'boolean') updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid signal fields provided' });
    }
    await db.collection('zones').doc(req.params.id).update(updates);
    return res.json({ success: true, zone_id: req.params.id, updated: updates });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/darkstores/:id/signals ───────────────────────────────

router.patch('/darkstores/:id/signals', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    if (typeof req.body.dispatch_outage !== 'boolean') {
      return res.status(400).json({ error: 'dispatch_outage (boolean) required' });
    }
    await db.collection('dark_stores').doc(req.params.id).update({
      dispatch_outage: req.body.dispatch_outage,
    });
    return res.json({ success: true, dark_store_id: req.params.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/dashboard — overview stats ─────────────────────────────

router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    const [poolsSnap, activePoliciesSnap, approvedClaimsSnap] = await Promise.all([
      db.collection('pools').get(),
      db.collection('policies').where('status', '==', 'active').get(),
      db.collection('claims').where('status', '==', 'approved').get(),
    ]);

    const totalPayouts = approvedClaimsSnap.docs.reduce((sum, d) => sum + (d.data().payout_amount || 0), 0);
    const totalCollected = poolsSnap.docs.reduce((sum, d) => sum + (d.data().total_collected || 0), 0);
    const totalClaimed = poolsSnap.docs.reduce((sum, d) => sum + (d.data().total_claimed || 0), 0);

    return res.json({
      active_pools: poolsSnap.size,
      total_riders_insured: activePoliciesSnap.size,
      total_payouts_issued: Math.round(totalPayouts),
      total_collected: Math.round(totalCollected),
      city_reserve_level: Math.round(totalCollected - totalClaimed),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/simulate-stress ────────────────────────────────────────

router.post('/simulate-stress', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    const { days = 14 } = req.body;
    
    const poolsSnap = await db.collection('pools').get();
    const activePoliciesSnap = await db.collection('policies').where('status', '==', 'active').get();
    
    // Simulate massive payout (500 per day per rider)
    const simulatedPayoutPerRider = 500 * days;
    const totalSimulatedPayout = simulatedPayoutPerRider * activePoliciesSnap.size;
    
    let currentCollected = 0;
    let currentClaimed = 0;
    poolsSnap.forEach(p => {
      const pd = p.data();
      currentCollected += (pd.total_collected || 0);
      currentClaimed += (pd.total_claimed || 0);
    });
    
    const projectedClaimed = currentClaimed + totalSimulatedPayout;
    const projectedBCR = currentCollected ? projectedClaimed / currentCollected : 0;
    
    const projectedReserveDrop = (currentCollected - currentClaimed) - totalSimulatedPayout;
    
    return res.json({
      simulated_days: days,
      affected_riders: activePoliciesSnap.size,
      total_simulated_payout: totalSimulatedPayout,
      projected_bcr: projectedBCR,
      projected_reserve_balance: projectedReserveDrop
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/trigger — manual disruption injection ─────────────────
// Body: { zone_id, trigger_type, severity? }
// Runs the full payout pipeline from step 4 onward (skips API polling).

router.post('/trigger', adminAuth, async (req, res) => {
  try {
    const { zone_id, trigger_type, severity } = req.body;
    const validTriggers = ['heavy_rain', 'flood', 'dispatch_outage', 'zone_restriction', 'extreme_heat'];

    if (!zone_id) return res.status(400).json({ error: 'zone_id is required' });
    if (!validTriggers.includes(trigger_type)) {
      return res.status(400).json({ error: `trigger_type must be one of: ${validTriggers.join(', ')}` });
    }

    const db = getDb();
    const { verificationPipeline: _ignored, runManualTrigger } = require('../services/triggerEngine');
    const result = await runManualTrigger({ zone_id, trigger_type, severity, triggeredBy: req.uid });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

