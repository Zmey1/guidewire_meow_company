const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getDb } = require('../config/firebase');
const { verificationPipeline } = require('../services/verificationPipeline');
const admin = require('firebase-admin');

const DUPLICATE_WINDOW_MS = 30 * 60 * 1000;

// ── GET /api/claims — rider's claim history ────────────────────────────────

router.get('/', auth, async (req, res) => {
  try {
    const db = getDb();
    const snap = await db.collection('claims')
      .where('worker_id', '==', req.uid)
      .orderBy('created_at', 'desc')
      .limit(50)
      .get();

    const claims = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return res.json({ claims });
  } catch (err) {
    console.error('[Claims] GET / error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch claims history' });
  }
});

// ── GET /api/claims/:id — claim detail ────────────────────────────────────

router.get('/:id', auth, async (req, res) => {
  try {
    const db = getDb();
    const doc = await db.collection('claims').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Claim not found' });
    const data = doc.data();
    if (data.worker_id !== req.uid) return res.status(403).json({ error: 'Forbidden' });
    return res.json({ claim: { id: doc.id, ...data } });
  } catch (err) {
    console.error('[Claims] GET /:id error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch claim details' });
  }
});

// ── POST /api/claims/file ─────────────────────────────────────────────────

router.post('/file', auth, async (req, res) => {
  try {
    const { trigger_type } = req.body;
    const validTriggers = ['heavy_rain', 'flood', 'dispatch_outage', 'zone_restriction', 'extreme_heat', 'unsafe_area'];
    if (!validTriggers.includes(trigger_type)) {
      return res.status(400).json({ error: `Invalid trigger_type. Choose: ${validTriggers.join(', ')}` });
    }

    const db = getDb();
    const worker = req.workerData;
    if (!worker) return res.status(404).json({ error: 'Worker profile not found' });

    // ── Guard 0: 7-delivery eligibility ──────────────────────────────────────
    if ((worker.total_deliveries || 0) < 7) {
      return res.status(400).json({ error: 'Coverage not active — complete your deliveries first' });
    }

    // ── Guard 1: active policy ───────────────────────────────────────────────
    const policySnap = await db.collection('policies')
      .where('worker_id', '==', req.uid)
      .where('status', '==', 'active')
      .limit(1).get();

    if (policySnap.empty) {
      return res.status(403).json({ error: 'No active policy. Get covered first.' });
    }
    const policyDoc = policySnap.docs[0];
    const policy = { id: policyDoc.id, ...policyDoc.data() };

    // ── Guard 2: 48-hour filing window ───────────────────────────────────────────
    const now = new Date();
    const daysArr = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

    let validWindow = false;
    for (const slot of (policy.shift_slots || [])) {
      const slotDayIdx = daysArr.indexOf(slot.day.toLowerCase());
      if (slotDayIdx === -1) continue;
      
      const [eh, em] = slot.end.split(':').map(Number);
      
      const currentDayIdx = now.getDay();
      let diffDays = currentDayIdx - slotDayIdx;
      if (diffDays < 0) diffDays += 7; 
      
      const shiftEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffDays, eh, em, 0, 0);
      
      if (shiftEnd > now) shiftEnd.setDate(shiftEnd.getDate() - 7);

      const hoursSinceEnd = (now - shiftEnd) / (1000 * 60 * 60);
      
      if (hoursSinceEnd <= 48 && hoursSinceEnd >= -24) {
        validWindow = true;
        break;
      }
    }

    if (!validWindow) {
      return res.status(403).json({ error: 'Filing window expired — claims must be filed within 48 hours of your shift' });
    }

    // ── Fetch zone + dark store ──────────────────────────────────────────────
    const [zoneDoc, darkStoreDoc] = await Promise.all([
      db.collection('zones').doc(worker.zone_id).get(),
      db.collection('dark_stores').doc(worker.dark_store_id).get(),
    ]);

    const zone = { id: zoneDoc.id, ...zoneDoc.data() };
    const darkStore = { id: darkStoreDoc.id, ...darkStoreDoc.data() };

    // ── Guard 3 + create claim, atomically ──────────────────────────────────
    // A per-(worker, trigger) lock doc is read and written in the same
    // transaction that creates the claim, so double-taps and concurrent
    // retries cannot create two claims for the same disruption.
    const claimRef = db.collection('claims').doc();
    const lockRef = db.collection('claim_locks').doc(`${req.uid}_${trigger_type}`);
    const nowMs = now.getTime();

    await db.runTransaction(async (tx) => {
      const lockDoc = await tx.get(lockRef);
      const lock = lockDoc.exists ? (lockDoc.data() || {}) : null;
      if (lock && nowMs - Number(lock.filed_at_ms || 0) < DUPLICATE_WINDOW_MS) {
        const filedAt = new Date(Number(lock.filed_at_ms)).toLocaleTimeString('en-IN');
        const err = new Error(`You already filed a ${trigger_type} claim at ${filedAt}`);
        err.code = 'DUPLICATE_CLAIM';
        err.claimId = lock.claim_id;
        throw err;
      }

      tx.set(lockRef, { worker_id: req.uid, trigger_type, claim_id: claimRef.id, filed_at_ms: nowMs });
      tx.create(claimRef, {
        worker_id: req.uid,
        policy_id: policy.id,
        zone_id: worker.zone_id,
        dark_store_id: worker.dark_store_id,
        trigger_type,
        trigger_event_id: null,
        risk_score: null,
        income_loss: null,
        scaled_payout: null,
        coverage_ratio: null,
        uncovered_loss: null,
        payout_amount: null,
        eligible_hours: null,
        peer_consensus_ratio: null,
        status: 'pending_verification',
        fraud_result: null,
        rejection_reason: null,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        resolved_at: null,
      });
    });

    // ── Run verification inside the request ─────────────────────────────────
    // Cloud Run only guarantees CPU while a request is in flight; work started
    // after the response is sent can be throttled or dropped when the instance
    // scales down. The pipeline takes a few seconds and never throws (failures
    // park the claim in pending_review), so we await it and return the result.
    await verificationPipeline(claimRef.id, { uid: req.uid, ...worker }, policy, zone, darkStore)
      .catch(err => console.error('[Claims] Pipeline uncaught error:', err.message));

    const resolved = (await claimRef.get()).data() || {};

    return res.status(200).json({
      claim_id: claimRef.id,
      status: resolved.status || 'pending_verification',
      payout_amount: resolved.payout_amount ?? null,
      rejection_reason: resolved.rejection_reason ?? null,
      review_reason: resolved.review_reason ?? null,
      message: resolved.status === 'pending_review'
        ? 'Claim filed. It is being held for manual review.'
        : 'Claim filed and verified.',
    });
  } catch (err) {
    if (err.code === 'DUPLICATE_CLAIM') {
      return res.status(429).json({ error: err.message, claim_id: err.claimId });
    }
    console.error('[Claims] POST /file error:', err.message);
    if (err.message.includes('requires an index')) {
      return res.status(500).json({ 
        error: 'System busy (Indexing). Please try again in 2-3 minutes.' 
      });
    }
    return res.status(500).json({ error: 'Failed to file claim. Please try again later.' });
  }
});

module.exports = router;
