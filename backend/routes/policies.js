const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getDb } = require('../config/firebase');
const admin = require('firebase-admin');
const { calculatePremium } = require('../services/aiService');

// ── Helpers ────────────────────────────────────────────────────────────────

function getWeekBounds() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { week_start: monday, week_end: sunday };
}

function normalizeWorkerTier(worker) {
  const rawTier = (worker && worker.worker_tier) || '';
  if (rawTier === 'partly_active' || rawTier === 'active') return rawTier;
  if (rawTier === 'low_activity') return 'partly_active';
  if (rawTier === 'regular') return 'active';
  if ((worker.active_days_this_week || 0) >= 3) return 'active';
  return 'partly_active';
}

function toWholeRupees(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}

// ── GET /api/policies/premium ──────────────────────────────────────────────

router.get('/premium', auth, async (req, res) => {
  try {
    const db = getDb();
    const worker = req.workerData;
    if (!worker) return res.status(404).json({ error: 'Worker profile not found' });

    // Fetch zone data
    const zoneDoc = await db.collection('zones').doc(worker.zone_id).get();
    const zone = zoneDoc.exists ? zoneDoc.data() : {};

    // Fetch pool surplus for current week to calculate rebate
    const { week_start } = getWeekBounds();
    const poolSnap = await db.collection('pools')
      .where('dark_store_id', '==', worker.dark_store_id)
      .where('week_start', '>=', week_start)
      .limit(1).get();

    let rebate_percent = 0.0;
    if (!poolSnap.empty) {
      const pool = poolSnap.docs[0].data();
      const collected = pool.total_collected || 1;
      const claimed = pool.total_claimed || 0;
      const lossRatio = collected > 0 ? (claimed / collected) : 1.0;
      if (lossRatio < 0.4) {
        rebate_percent = 0.40;
      } else if (lossRatio < 0.6) {
        rebate_percent = 0.20;
      }
    }

    const base_raw = (zone.trigger_probability || 0.1) * (zone.avg_daily_income_loss || 400) * 7 * (zone.city_factor || 1.0);
    const pool_surplus_rebate = base_raw * rebate_percent;

    const premiumData = await calculatePremium({
      zone_trigger_probability: zone.trigger_probability || 0.1,
      avg_daily_income_loss: zone.avg_daily_income_loss || 400,
      days_exposed: 7,
      city_factor: zone.city_factor || 1.0,
      pool_surplus_rebate,
    });

    const workerTier = normalizeWorkerTier(worker);
    const weekly_cap = (worker.weekly_income_band || 10000) * 0.2;
    const effective_weekly_cap = workerTier === 'partly_active' ? Math.round(weekly_cap * 0.6) : weekly_cap;

    return res.json({ 
      ...premiumData,
      weekly_cap,
      effective_weekly_cap,
      worker_tier: workerTier
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/policies/purchase ────────────────────────────────────────────
// Body: { plan, shift_slots, premium_paid }

router.post('/purchase', auth, async (req, res) => {
  try {
    const { shift_slots, premium_paid } = req.body;

    if (!Array.isArray(shift_slots) || shift_slots.length === 0) {
      return res.status(400).json({ error: 'shift_slots array is required' });
    }

    const db = getDb();
    const worker = req.workerData;
    if (!worker) return res.status(404).json({ error: 'Worker profile not found' });

    if ((worker.total_deliveries || 0) < 7) {
      return res.status(400).json({ error: 'Complete 7 deliveries to be eligible for coverage' });
    }

    const zoneDoc = await db.collection('zones').doc(worker.zone_id).get();
    if (zoneDoc.exists && zoneDoc.data().enrollment_suspended === true) {
      return res.status(403).json({
        error: 'Policy purchase is currently suspended for your zone due to high loss ratio. Please try again later.',
      });
    }

    const { week_start, week_end } = getWeekBounds();

    // Block duplicate active policy
    const existing = await db.collection('policies')
      .where('worker_id', '==', req.uid)
      .where('status', '==', 'active')
      .limit(1).get();

    if (!existing.empty) {
      return res.status(409).json({ error: 'Active policy already exists for this week' });
    }

    // Upsert pool for dark_store + week
    const poolQuery = await db.collection('pools')
      .where('dark_store_id', '==', worker.dark_store_id)
      .where('week_start', '>=', week_start)
      .limit(1).get();

    const effectivePremium = toWholeRupees(premium_paid);
    let poolId;
    if (poolQuery.empty) {
      const poolRef = await db.collection('pools').add({
        dark_store_id: worker.dark_store_id,
        zone_id: worker.zone_id,
        week_start,
        week_end,
        total_collected: effectivePremium,
        total_claimed: 0,
        surplus: effectivePremium,
        reserve_used: 0,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      poolId = poolRef.id;
    } else {
      const poolRef = poolQuery.docs[0].ref;
      await poolRef.update({
        total_collected: admin.firestore.FieldValue.increment(effectivePremium),
        surplus: admin.firestore.FieldValue.increment(effectivePremium),
      });
      poolId = poolQuery.docs[0].id;
    }

    // Weekly cap — partly_active workers get 60%
    const workerTierAtPurchase = normalizeWorkerTier(worker);
    const weekly_cap = (worker.weekly_income_band || 10000) * 0.2;
    const effective_weekly_cap = workerTierAtPurchase === 'partly_active'
      ? Math.round(weekly_cap * 0.6)
      : weekly_cap;

    const policyRef = await db.collection('policies').add({
      worker_id: req.uid,
      zone_id: worker.zone_id,
      dark_store_id: worker.dark_store_id,
      week_start,
      week_end,
      shift_slots,
      premium_paid: effectivePremium,
      status: 'active',
      weekly_cap,
      effective_weekly_cap,
      worker_tier_at_purchase: workerTierAtPurchase,
      payouts_issued_this_week: 0,
      pool_id: poolId,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Deduct from wallet
    const walletRef = db.collection('wallets').doc(req.uid);
    const walletDoc = await walletRef.get();
    if (walletDoc.exists) {
      await walletRef.update({
        balance: admin.firestore.FieldValue.increment(-effectivePremium),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await walletRef.set({
        balance: -effectivePremium,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await walletRef.collection('transactions').add({
      type: 'premium',
      amount: -effectivePremium,
      description: `ShiftSure Coverage purchase`,
      policy_id: policyRef.id,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({
      policy_id: policyRef.id,
      week_start,
      week_end,
      weekly_cap,
      effective_weekly_cap,
      worker_tier_at_purchase: workerTierAtPurchase,
      pool_id: poolId,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/policies/current ───────────────────────────────────────────────

router.get('/current', auth, async (req, res) => {
  try {
    const db = getDb();
    const snap = await db.collection('policies')
      .where('worker_id', '==', req.uid)
      .where('status', '==', 'active')
      .orderBy('created_at', 'desc')
      .limit(1).get();

    if (snap.empty) return res.json({ policy: null });

    const doc = snap.docs[0];
    return res.json({ policy: { id: doc.id, ...doc.data() } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
