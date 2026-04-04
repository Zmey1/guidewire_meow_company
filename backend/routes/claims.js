const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getDb } = require('../config/firebase');
const { verificationPipeline } = require('../services/verificationPipeline');
const admin = require('firebase-admin');

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

    // ── Guard 3: duplicate (same trigger_type within 30 min) ──────────────────
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const dupSnap = await db.collection('claims')
      .where('worker_id', '==', req.uid)
      .where('trigger_type', '==', trigger_type)
      .where('created_at', '>=', thirtyMinAgo)
      .limit(1).get();

    if (!dupSnap.empty) {
      const existingClaim = dupSnap.docs[0].data();
      const filedAt = existingClaim.created_at?.toDate?.()?.toLocaleTimeString('en-IN') || 'recently';
      return res.status(429).json({
        error: `You already filed a ${trigger_type} claim at ${filedAt}`,
      });
    }

    // ── Fetch zone + dark store ──────────────────────────────────────────────
    const [zoneDoc, darkStoreDoc] = await Promise.all([
      db.collection('zones').doc(worker.zone_id).get(),
      db.collection('dark_stores').doc(worker.dark_store_id).get(),
    ]);

    const zone = { id: zoneDoc.id, ...zoneDoc.data() };
    const darkStore = { id: darkStoreDoc.id, ...darkStoreDoc.data() };

    // ── Create claim (pending) ────────────────────────────────────────────────
    const claimRef = await db.collection('claims').add({
      worker_id: req.uid,
      policy_id: policy.id,
      zone_id: worker.zone_id,
      dark_store_id: worker.dark_store_id,
      trigger_type,
      trigger_event_id: null,
      risk_score: null,
      payout_amount: null,
      eligible_hours: null,
      peer_consensus_ratio: null,
      status: 'pending_verification',
      fraud_result: null,
      rejection_reason: null,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      resolved_at: null,
    });

    // ── Fire async verification (do NOT await) ─────────────────────────────
    verificationPipeline(claimRef.id, { uid: req.uid, ...worker }, policy, zone, darkStore)
      .catch(err => console.error('[Claims] Pipeline uncaught error:', err.message));

    return res.status(202).json({
      claim_id: claimRef.id,
      status: 'pending_verification',
      message: 'Claim filed. Verification in progress.',
    });
  } catch (err) {
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
