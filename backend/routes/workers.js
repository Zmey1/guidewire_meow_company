const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getDb } = require('../config/firebase');

const admin = require('firebase-admin');

// POST /api/workers/register
router.post('/register', auth, async (req, res) => {
  try {
    const { name, phone, dark_store_id, weekly_income_band } = req.body;
    if (!name || !phone || !dark_store_id || !weekly_income_band) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const db = getDb();
    
    // Get zone_id from dark_store
    const dsDoc = await db.collection('dark_stores').doc(dark_store_id).get();
    const zone_id = dsDoc.exists ? (dsDoc.data().zone_id || 'zone_blr_south') : 'zone_blr_south';

    const batch = db.batch();
    
    const workerRef = db.collection('workers').doc(req.uid);
    batch.set(workerRef, {
      name,
      phone,
      dark_store_id,
      zone_id,
      active_days_this_week: 0,
      total_deliveries: 0,
      weekly_income_band,
      avg_daily_income_loss: Math.round(weekly_income_band / 6),
      worker_tier: 'regular',
      trust_score: 80,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    const walletRef = db.collection('wallets').doc(req.uid);
    batch.set(walletRef, {
      balance: 0,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    await batch.commit();

    return res.json({ success: true, uid: req.uid });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/workers/me
router.get('/me', auth, async (req, res) => {
  try {
    const db = getDb();
    const workerDoc = await db.collection('workers').doc(req.uid).get();
    if (!workerDoc.exists) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    const worker = workerDoc.data();

    // Fetch dark store
    let darkStore = null;
    if (worker.dark_store_id) {
      const dsDoc = await db.collection('dark_stores').doc(worker.dark_store_id).get();
      if (dsDoc.exists) darkStore = { id: dsDoc.id, ...dsDoc.data() };
    }

    // Fetch zone
    let zone = null;
    if (worker.zone_id) {
      const zoneDoc = await db.collection('zones').doc(worker.zone_id).get();
      if (zoneDoc.exists) zone = { id: zoneDoc.id, ...zoneDoc.data() };
    }

    return res.json({ uid: req.uid, ...worker, dark_store: darkStore, zone });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
