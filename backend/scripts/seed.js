/**
 * seed.js — Seed Firestore with full demo data for ShiftSure hackathon.
 * Generates:
 *   - 6 zones, 6 dark stores
 *   - 8 workers (7 riders + 1 admin) in Firebase Auth + Firestore
 *   - 37 days of historical policies, claims, wallet transactions
 *     (30 days past + current 7-day week)
 *   - Replaces existing seeded rider history on every run
 *   - Current-week active policy for demo rider with deterministic manual-claim coverage
 *
 * Run: GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/seed.js
 */

const AUTH_DOMAIN = 'shiftsure.in';
const authEmailFromPhone = (phone) => `${String(phone).trim()}@${AUTH_DOMAIN}`;

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

const db = admin.firestore();
const auth = admin.auth();

// ── Utils ────────────────────────────────────────────────────────────────────

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function weekStart(d) {
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function weekEnd(mon) {
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return sun;
}

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function getWorkerTier(activeDays) { return activeDays >= 3 ? 'active' : 'partly_active'; }

const DEMO_ZONE_ID = 'zone_demo_claims';
const DEMO_DARK_STORE_ID = 'ds_demo_claims';
const DEMO_POOL_ID = 'pool_demo_current';
const DEMO_TRIGGER_EVENT_ID = 'evt_demo_current';
const KORAMANGALA_ZONE_ID = 'zone_koramangala';
const KORAMANGALA_DARK_STORE_ID = 'ds_koramangala';

async function deleteDocs(docs) {
  if (!docs.length) return 0;

  let deleted = 0;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + 400)) {
      batch.delete(doc.ref);
      deleted += 1;
    }
    await batch.commit();
  }
  return deleted;
}

async function resetSeededHistory(riderUids) {
  console.log('\n-- Resetting seeded rider history...');

  let deletedPolicies = 0;
  let deletedClaims = 0;
  let deletedTransactions = 0;

  for (const uid of riderUids) {
    const [policySnap, claimSnap, txSnap] = await Promise.all([
      db.collection('policies').where('worker_id', '==', uid).get(),
      db.collection('claims').where('worker_id', '==', uid).get(),
      db.collection('wallets').doc(uid).collection('transactions').get(),
    ]);

    deletedPolicies += await deleteDocs(policySnap.docs);
    deletedClaims += await deleteDocs(claimSnap.docs);
    deletedTransactions += await deleteDocs(txSnap.docs);
  }

  console.log(
    `  ✅ Cleared ${deletedPolicies} policies, ${deletedClaims} claims, ${deletedTransactions} wallet transactions for seeded riders`,
  );
}

const SHIFT_SLOTS = [
  { day: 'mon', start: '17:00', end: '23:00' },
  { day: 'tue', start: '17:00', end: '23:00' },
  { day: 'wed', start: '17:00', end: '23:00' },
  { day: 'thu', start: '17:00', end: '23:00' },
  { day: 'fri', start: '17:00', end: '23:00' },
  { day: 'sat', start: '12:00', end: '22:00' },
  { day: 'sun', start: '12:00', end: '22:00' },
];

const DEMO_CLAIM_SHIFT_SLOTS = [
  { day: 'mon', start: '00:00', end: '23:59' },
  { day: 'tue', start: '00:00', end: '23:59' },
  { day: 'wed', start: '00:00', end: '23:59' },
  { day: 'thu', start: '00:00', end: '23:59' },
  { day: 'fri', start: '00:00', end: '23:59' },
  { day: 'sat', start: '00:00', end: '23:59' },
  { day: 'sun', start: '00:00', end: '23:59' },
];

// ── Zones ────────────────────────────────────────────────────────────────────

const zones = [
  { id: 'zone_koramangala', name: 'Koramangala', city: 'Bangalore', lat: 12.9352, lng: 77.6245, base_orders_per_day: 320, historical_disruption_rate: 0.25, current_risk_score: 60, zone_density_factor: 1.2, trigger_probability: 0.35, avg_daily_income_loss: 450, city_factor: 1.0, enrollment_suspended: false, rainfall_mm: 22, flood_signal: true, severe_flood_signal: false, dispatch_outage: false, heat_index: 33, aqi: 74, zone_restriction: false, unsafe_signal: false },
  { id: DEMO_ZONE_ID, name: 'Demo Claims District', city: 'Bangalore', lat: 12.9346, lng: 77.6262, base_orders_per_day: 240, historical_disruption_rate: 0.28, current_risk_score: 100, zone_density_factor: 1.1, trigger_probability: 0.45, avg_daily_income_loss: 480, city_factor: 1.0, enrollment_suspended: false, rainfall_mm: 0, flood_signal: true, severe_flood_signal: true, dispatch_outage: false, heat_index: 32, aqi: 70, zone_restriction: false, unsafe_signal: false },
  { id: 'zone_indiranagar', name: 'Indiranagar', city: 'Bangalore', lat: 12.9784, lng: 77.6408, base_orders_per_day: 280, historical_disruption_rate: 0.18, current_risk_score: 30, zone_density_factor: 1.1, trigger_probability: 0.25, avg_daily_income_loss: 400, city_factor: 1.0, enrollment_suspended: false, rainfall_mm: 8, flood_signal: false, severe_flood_signal: false, dispatch_outage: true, heat_index: 32, aqi: 62, zone_restriction: false, unsafe_signal: false },
  { id: 'zone_hsr', name: 'HSR Layout', city: 'Bangalore', lat: 12.9116, lng: 77.6389, base_orders_per_day: 210, historical_disruption_rate: 0.12, current_risk_score: 15, zone_density_factor: 1.0, trigger_probability: 0.40, avg_daily_income_loss: 500, city_factor: 1.1, enrollment_suspended: true, rainfall_mm: 5, flood_signal: false, severe_flood_signal: false, dispatch_outage: false, heat_index: 36, aqi: 88, zone_restriction: false, unsafe_signal: false },
  { id: 'zone_whitefield', name: 'Whitefield', city: 'Bangalore', lat: 12.9698, lng: 77.7499, base_orders_per_day: 190, historical_disruption_rate: 0.10, current_risk_score: 10, zone_density_factor: 0.9, trigger_probability: 0.30, avg_daily_income_loss: 420, city_factor: 1.05, enrollment_suspended: false, rainfall_mm: 4, flood_signal: false, severe_flood_signal: false, dispatch_outage: false, heat_index: 31, aqi: 54, zone_restriction: false, unsafe_signal: false },
  { id: 'zone_electronic_city', name: 'Electronic City', city: 'Bangalore', lat: 12.8399, lng: 77.677, base_orders_per_day: 160, historical_disruption_rate: 0.09, current_risk_score: 8, zone_density_factor: 0.85, trigger_probability: 0.20, avg_daily_income_loss: 380, city_factor: 0.95, enrollment_suspended: false, rainfall_mm: 2, flood_signal: false, severe_flood_signal: false, dispatch_outage: false, heat_index: 30, aqi: 50, zone_restriction: false, unsafe_signal: true },
];

// ── Dark Stores ──────────────────────────────────────────────────────────────

const darkStores = [
  { id: 'ds_koramangala', name: 'Zepto Koramangala', zone_id: 'zone_koramangala', city: 'Bangalore', dispatch_outage: false },
  { id: DEMO_DARK_STORE_ID, name: 'Demo Claims Hub', zone_id: DEMO_ZONE_ID, city: 'Bangalore', dispatch_outage: false },
  { id: 'ds_indiranagar', name: 'Blinkit Indiranagar', zone_id: 'zone_indiranagar', city: 'Bangalore', dispatch_outage: true },
  { id: 'ds_hsr', name: 'Swiggy Instamart HSR', zone_id: 'zone_hsr', city: 'Bangalore', dispatch_outage: false },
  { id: 'ds_whitefield', name: 'Zepto Whitefield', zone_id: 'zone_whitefield', city: 'Bangalore', dispatch_outage: false },
  { id: 'ds_electronic_city', name: 'Blinkit Electronic City', zone_id: 'zone_electronic_city', city: 'Bangalore', dispatch_outage: false },
];

// ── Workers ──────────────────────────────────────────────────────────────────

const workerDefs = [
  { password: 'Demo@1234', name: 'Demo Rider', phone: '9000000001', dark_store_id: DEMO_DARK_STORE_ID, zone_id: DEMO_ZONE_ID, weekly_income_band: 12000, weekly_hours: 46, active_days_this_week: 5, total_deliveries: 104, isDemo: true },
  { password: 'Rider@123', name: 'Raj Kumar', phone: '9876543210', dark_store_id: 'ds_koramangala', zone_id: 'zone_koramangala', weekly_income_band: 12000, weekly_hours: 45, active_days_this_week: 5, total_deliveries: 120 },
  { password: 'Rider@123', name: 'Priya Suresh', phone: '9876543211', dark_store_id: 'ds_koramangala', zone_id: 'zone_koramangala', weekly_income_band: 9000, weekly_hours: 28, active_days_this_week: 2, total_deliveries: 34 },
  { password: 'Rider@123', name: 'Arjun Verma', phone: '9876543212', dark_store_id: 'ds_indiranagar', zone_id: 'zone_indiranagar', weekly_income_band: 15000, weekly_hours: 50, active_days_this_week: 6, total_deliveries: 210 },
  { password: 'Rider@123', name: 'Meena Rao', phone: '9876543213', dark_store_id: 'ds_indiranagar', zone_id: 'zone_indiranagar', weekly_income_band: 6000, weekly_hours: 24, active_days_this_week: 1, total_deliveries: 3 }, // < 7 deliveries — ineligible demo
  { password: 'Rider@123', name: 'Deepa Nair', phone: '9876543215', dark_store_id: 'ds_whitefield', zone_id: 'zone_whitefield', weekly_income_band: 12000, weekly_hours: 42, active_days_this_week: 4, total_deliveries: 88 },
  { password: 'Rider@123', name: 'Suresh T', phone: '9876543216', dark_store_id: 'ds_electronic_city', zone_id: 'zone_electronic_city', weekly_income_band: 6000, weekly_hours: 30, active_days_this_week: 2, total_deliveries: 12 },
  { password: 'Rider@123', name: 'Kiran M', phone: '9876543214', dark_store_id: 'ds_hsr', zone_id: 'zone_hsr', weekly_income_band: 9000, weekly_hours: 27, active_days_this_week: 2, total_deliveries: 5 }, // < 7 deliveries
];

// ── Historical event definitions ─────────────────────────────────────────────
// 5 trigger events spread across the past 37 days with realistic risk scores

const HISTORICAL_EVENTS = [
  { daysBack: 30, trigger_type: 'heavy_rain', zone_id: 'zone_koramangala', risk_score: 72, tier: 'tier2', payout_fraction: 0.7, source: 'system' },
  { daysBack: 24, trigger_type: 'flood', zone_id: 'zone_koramangala', risk_score: 85, tier: 'full', payout_fraction: 1.0, source: 'system' },
  { daysBack: 18, trigger_type: 'dispatch_outage', zone_id: 'zone_indiranagar', risk_score: 80, tier: 'tier2', payout_fraction: 0.7, source: 'system' },
  { daysBack: 12, trigger_type: 'extreme_heat', zone_id: 'zone_hsr', risk_score: 60, tier: 'tier1', payout_fraction: 0.4, source: 'system' },
  { daysBack: 7, trigger_type: 'heavy_rain', zone_id: 'zone_koramangala', risk_score: 68, tier: 'tier2', payout_fraction: 0.7, source: 'system' },
  { daysBack: 5, trigger_type: 'zone_restriction', zone_id: 'zone_indiranagar', risk_score: 80, tier: 'tier2', payout_fraction: 0.7, source: 'admin' },
  { daysBack: 2, trigger_type: 'heavy_rain', zone_id: 'zone_koramangala', risk_score: 55, tier: 'tier1', payout_fraction: 0.4, source: 'system' },
  { daysBack: 1, trigger_type: 'extreme_heat', zone_id: 'zone_hsr', risk_score: 18, tier: 'none', payout_fraction: 0, source: 'system' }, // rejected — below threshold
];

async function seed() {
  console.log('🌱 Starting Firestore seed...\n');

  // ── Zones ──────────────────────────────────────────────────────────────────
  console.log('-- Seeding zones...');
  for (const z of zones) {
    const { id, ...data } = z;
    await db.collection('zones').doc(id).set({ ...data, created_at: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('zone_config').doc(id).set({
      zone_id: id,
      enrollment_suspended: !!z.enrollment_suspended,
      suspension_reason: z.enrollment_suspended ? 'Seeded suspension: loss ratio above threshold' : null,
      suspended_at: z.enrollment_suspended ? admin.firestore.FieldValue.serverTimestamp() : null,
      reinstated_at: z.enrollment_suspended ? null : admin.firestore.FieldValue.serverTimestamp(),
      reinstated_by: null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`  ✅ Zone: ${z.name}`);
  }

  // ── Dark Stores ────────────────────────────────────────────────────────────
  console.log('\n-- Seeding dark stores...');
  for (const ds of darkStores) {
    const { id, ...data } = ds;
    await db.collection('dark_stores').doc(id).set({ ...data, created_at: admin.firestore.FieldValue.serverTimestamp() });
    console.log(`  ✅ Dark Store: ${ds.name}`);
  }

  // ── Workers ────────────────────────────────────────────────────────────────
  console.log('\n-- Seeding workers...');
  const workerUids = {};
  for (const w of workerDefs) {
    const authEmail = authEmailFromPhone(w.phone);
    let uid;

    try {
      const existing = await auth.getUserByEmail(authEmail);
      uid = existing.uid;
      console.log(`  ⏭  Worker exists: ${w.name} (${authEmail})`);
    } catch {
      const created = await auth.createUser({
        email: authEmail,
        password: w.password,
        displayName: w.name,
      });
      uid = created.uid;
      console.log(`  ✅ Worker created: ${w.name} (${authEmail}) (${uid})`);
    }

    workerUids[authEmail] = uid;

    await db.collection('workers').doc(uid).set({
      name: w.name,
      phone: w.phone,
      email: authEmail,
      dark_store_id: w.dark_store_id,
      zone_id: w.zone_id,
      weekly_income_band: w.weekly_income_band,
      weekly_hours: w.weekly_hours || 40,
      active_days_this_week: w.active_days_this_week,
      total_deliveries: w.total_deliveries,
      avg_daily_income_loss: Math.round(w.weekly_income_band / 6),
      worker_tier: getWorkerTier(w.active_days_this_week),
      role: 'rider',
      push_token: null,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('wallets').doc(uid).set({
      balance: w.isDemo ? 2500 : rand(500, 2000),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // ── Admin ──────────────────────────────────────────────────────────────────
  console.log('\n-- Seeding admin...');
  let adminUid;
  try {
    const existing = await auth.getUserByEmail('admin@shiftsure.in');
    adminUid = existing.uid;
    console.log('  ⏭  Admin exists');
  } catch {
    const created = await auth.createUser({ email: 'admin@shiftsure.in', password: 'Admin@123', displayName: 'ShiftSure Admin' });
    adminUid = created.uid;
    console.log(`  ✅ Admin created (${adminUid})`);
  }
  await db.collection('workers').doc(adminUid).set({
    name: 'ShiftSure Admin', email: 'admin@shiftsure.in',
    role: 'admin', created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  workerUids['admin@shiftsure.in'] = adminUid;

  const seededRiderUids = workerDefs
    .map((w) => workerUids[authEmailFromPhone(w.phone)])
    .filter(Boolean);
  await resetSeededHistory(seededRiderUids);

  // ── Historical trigger events ──────────────────────────────────────────────
  console.log('\n-- Seeding trigger events...');
  const triggerEventIds = {};
  for (const ev of HISTORICAL_EVENTS) {
    const ref = db.collection('trigger_events').doc();
    const evDate = daysAgo(ev.daysBack);
    await ref.set({
      zone_id: ev.zone_id, trigger_type: ev.trigger_type,
      risk_score: ev.risk_score, tier: ev.tier,
      source: ev.source || 'system',
      rainfall_mm: ev.trigger_type === 'heavy_rain' ? rand(20, 50) : 0,
      heat_index: ev.trigger_type === 'extreme_heat' ? rand(44, 48) : 32,
      aqi: ev.trigger_type === 'extreme_heat' ? rand(310, 420) : 50,
      flood_signal: ev.trigger_type === 'flood',
      severe_flood_signal: ev.tier === 'full' && ev.trigger_type === 'flood',
      dispatch_outage: ev.trigger_type === 'dispatch_outage',
      zone_restriction: ev.trigger_type === 'zone_restriction',
      unsafe_signal: false,
      created_at: admin.firestore.Timestamp.fromDate(evDate),
    });
    triggerEventIds[`${ev.zone_id}_${ev.daysBack}`] = { id: ref.id, ...ev };
    console.log(`  ✅ Trigger event: ${ev.trigger_type} in ${ev.zone_id} (${ev.daysBack}d ago) → risk ${ev.risk_score}`);
  }

  // ── Historical policies, claims, wallets ────────────────────────────────────
  console.log('\n-- Seeding historical policies + claims + transactions...');

  // We create weekly policies for 5 past weeks + current week for eligible workers
  // Eligible workers: demo rider, raj, priya, arjun, deepa, suresh (total_deliveries >= 7)
  const eligibleWorkers = workerDefs.filter(w => w.total_deliveries >= 7);

  // Collect pool data by (dark_store_id, week_start ISO)
  const poolAccumulators = {};

  for (const w of eligibleWorkers) {
    const uid = workerUids[authEmailFromPhone(w.phone)];
    if (!uid) continue;
    const historicalZoneId = w.isDemo ? KORAMANGALA_ZONE_ID : w.zone_id;
    const historicalDarkStoreId = w.isDemo ? KORAMANGALA_DARK_STORE_ID : w.dark_store_id;

    let walletBalance = w.isDemo ? 2500 : rand(500, 2000);

    // 5 past weeks (weeks ending 7, 14, 21, 28, 35 days ago)
    for (let weekIdx = 0; weekIdx < 5; weekIdx++) {
      const weekEndDay = (weekIdx + 1) * 7;
      const wStart = weekStart(daysAgo(weekEndDay));
      const wEnd = weekEnd(wStart);
      const premiumPaid = [49, 89, 89, 149, 89][weekIdx];
      const plan = ['lite', 'standard', 'standard', 'plus', 'standard'][weekIdx];
      const weekly_cap = { lite: 500, standard: 1000, plus: 2000 }[plan];
      const workerTierForWeek = getWorkerTier(w.active_days_this_week);
      const effectiveWeeklyCap = workerTierForWeek === 'partly_active'
        ? Math.round(weekly_cap * 0.6)
        : weekly_cap;

      // Pool tracking
      const poolKey = `${historicalDarkStoreId}__${wStart.toISOString()}`;
      if (!poolAccumulators[poolKey]) {
        poolAccumulators[poolKey] = {
          dark_store_id: historicalDarkStoreId,
          zone_id: historicalZoneId,
          week_start: wStart,
          week_end: wEnd,
          total_collected: 0, total_claimed: 0, surplus: 0, reserve_used: 0,
        };
      }
      poolAccumulators[poolKey].total_collected += premiumPaid;
      poolAccumulators[poolKey].surplus += premiumPaid;

      walletBalance -= premiumPaid;

      const policyRef = db.collection('policies').doc();
      let payoutsIssued = 0;

      // Check if any historical trigger events match this worker's zone + week
      const matchingEvents = HISTORICAL_EVENTS.filter(ev =>
        ev.zone_id === historicalZoneId &&
        ev.daysBack >= weekEndDay - 6 &&
        ev.daysBack <= weekEndDay &&
        ev.risk_score >= 40
      );

      for (const ev of matchingEvents) {
        const cappedPayout = Math.min(Math.round(200 * ev.payout_fraction), effectiveWeeklyCap - payoutsIssued);
        if (cappedPayout <= 0) continue;

        payoutsIssued += cappedPayout;
        poolAccumulators[poolKey].total_claimed += cappedPayout;
        poolAccumulators[poolKey].surplus -= cappedPayout;
        walletBalance += cappedPayout;

        const evDate = daysAgo(ev.daysBack);
        const eligibleHours = parseFloat((cappedPayout / 120).toFixed(2));
        const coverageRatio = parseFloat((0.56 + (ev.payout_fraction * 0.1)).toFixed(3));
        const scaledPayout = Math.round(cappedPayout * 1.08);
        const incomeLoss = Math.round(scaledPayout / Math.max(coverageRatio, 0.55));
        const uncoveredLoss = Math.max(0, incomeLoss - cappedPayout);
        const claimRef = db.collection('claims').doc();
        await claimRef.set({
          worker_id: uid, policy_id: policyRef.id,
          zone_id: historicalZoneId, dark_store_id: historicalDarkStoreId,
          trigger_type: ev.trigger_type,
          trigger_event_id: (triggerEventIds[`${ev.zone_id}_${ev.daysBack}`] && triggerEventIds[`${ev.zone_id}_${ev.daysBack}`].id) || null,
          risk_score: ev.risk_score,
          income_loss: incomeLoss,
          scaled_payout: scaledPayout,
          coverage_ratio: coverageRatio,
          uncovered_loss: uncoveredLoss,
          payout_amount: cappedPayout,
          eligible_hours: eligibleHours,
          peer_consensus_ratio: parseFloat((rand(30, 75) / 100).toFixed(2)),
          status: 'approved',
          fraud_result: { graph_anomaly_score: 0.05, ring_detected: 'none', trust_score_at_check: 1.0, decision_source: 'matrix' },
          rejection_reason: null,
          source: ev.source || 'system',
          created_at: admin.firestore.Timestamp.fromDate(evDate),
          resolved_at: admin.firestore.Timestamp.fromDate(new Date(evDate.getTime() + 3000)),
        });

        // Wallet tx
        await db.collection('wallets').doc(uid).collection('transactions').add({
          type: 'payout', amount: cappedPayout,
          description: `Claim approved — ${ev.trigger_type.replace(/_/g, ' ')}`,
          claim_id: claimRef.id,
          created_at: admin.firestore.Timestamp.fromDate(evDate),
        });
      }

      // Premium deduction tx
      const premiumDate = new Date(wStart);
      premiumDate.setHours(9, 0, 0, 0);
      await db.collection('wallets').doc(uid).collection('transactions').add({
        type: 'premium', amount: -premiumPaid,
        description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} plan purchase`,
        policy_id: policyRef.id,
        created_at: admin.firestore.Timestamp.fromDate(premiumDate),
      });

      // Add a rejected claim in some weeks for realism
      if (weekIdx === 1 && matchingEvents.length === 0) {
        const rejectDate = daysAgo(weekEndDay - 3);
        const claimRef = db.collection('claims').doc();
        await claimRef.set({
          worker_id: uid, policy_id: policyRef.id,
          zone_id: historicalZoneId, dark_store_id: historicalDarkStoreId,
          trigger_type: 'extreme_heat',
          trigger_event_id: null,
          risk_score: 18,
          income_loss: 420,
          scaled_payout: 250,
          coverage_ratio: 0.595,
          uncovered_loss: 420,
          payout_amount: 0,
          eligible_hours: 2.0,
          peer_consensus_ratio: 0.1,
          status: 'rejected',
          fraud_result: null,
          rejection_reason: 'Disruption not verified — risk score 18.0 below threshold of 40',
          source: 'system',
          created_at: admin.firestore.Timestamp.fromDate(rejectDate),
          resolved_at: admin.firestore.Timestamp.fromDate(new Date(rejectDate.getTime() + 2000)),
        });
      }

      // Write policy (expired)
      await policyRef.set({
        worker_id: uid, plan, zone_id: historicalZoneId, dark_store_id: historicalDarkStoreId,
        week_start: wStart, week_end: wEnd, shift_slots: SHIFT_SLOTS,
        premium_paid: premiumPaid, status: 'expired',
        weekly_cap,
        effective_weekly_cap: effectiveWeeklyCap,
        worker_tier_at_purchase: workerTierForWeek,
        payouts_issued_this_week: payoutsIssued,
        pool_id: poolKey.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 100),
        created_at: admin.firestore.Timestamp.fromDate(wStart),
      });
    }

    const rebateAmount = rand(20, 80);
    walletBalance += rebateAmount;
    await db.collection('wallets').doc(uid).collection('transactions').add({
      type: 'rebate',
      amount: rebateAmount,
      description: 'Weekly pool surplus rebate',
      created_at: admin.firestore.Timestamp.fromDate(daysAgo(rand(2, 9))),
    });

    if (walletBalance > 500) {
      const withdrawalAmount = Math.min(rand(120, 320), Math.floor(walletBalance * 0.35));
      walletBalance -= withdrawalAmount;
      await db.collection('wallets').doc(uid).collection('transactions').add({
        type: 'withdrawal',
        amount: -withdrawalAmount,
        description: 'Wallet withdrawal',
        created_at: admin.firestore.Timestamp.fromDate(daysAgo(rand(1, 6))),
      });
    }

    // Update wallet with accumulated balance
    await db.collection('wallets').doc(uid).update({ balance: Math.max(0, walletBalance) });
  }

  // ── Current-week active policy (demo rider only) ────────────────────────────
  console.log('\n-- Seeding current-week active policy for demo rider...');
  const demoUid = workerUids[authEmailFromPhone('9000000001')];
  const now = new Date();
  const curMonday = weekStart(now);
  const curSunday = weekEnd(curMonday);

  if (demoUid) {
    await db.collection('trigger_events').doc(DEMO_TRIGGER_EVENT_ID).set({
      zone_id: DEMO_ZONE_ID,
      trigger_type: 'heavy_rain',
      risk_score: 55,
      tier: 'tier1',
      source: 'system',
      rainfall_mm: 24,
      heat_index: 32,
      aqi: 70,
      flood_signal: false,
      severe_flood_signal: false,
      dispatch_outage: false,
      zone_restriction: false,
      unsafe_signal: false,
      created_at: admin.firestore.Timestamp.fromDate(daysAgo(2)),
    });

    const policyRef = db.collection('policies').doc('policy_demo_current');
    await policyRef.set({
      worker_id: demoUid, plan: 'standard',
      zone_id: DEMO_ZONE_ID, dark_store_id: DEMO_DARK_STORE_ID,
      week_start: curMonday, week_end: curSunday,
      shift_slots: DEMO_CLAIM_SHIFT_SLOTS,
      premium_paid: 89, status: 'active',
      weekly_cap: 1000, effective_weekly_cap: 1000,
      worker_tier_at_purchase: 'active',
      payouts_issued_this_week: 340,
      pool_id: DEMO_POOL_ID,
      created_at: admin.firestore.Timestamp.fromDate(curMonday),
    });

    // Current week approved claim (2 days ago)
    const claimDate = daysAgo(2);
    await db.collection('claims').doc('claim_demo_current').set({
      worker_id: demoUid, policy_id: 'policy_demo_current',
      zone_id: DEMO_ZONE_ID, dark_store_id: DEMO_DARK_STORE_ID,
      trigger_type: 'heavy_rain',
      trigger_event_id: DEMO_TRIGGER_EVENT_ID,
      risk_score: 55,
      income_loss: 590,
      scaled_payout: 380,
      coverage_ratio: 0.645,
      uncovered_loss: 250,
      payout_amount: 340,
      eligible_hours: 3.5,
      peer_consensus_ratio: 0.65, status: 'approved',
      fraud_result: { graph_anomaly_score: 0.05, ring_detected: 'none', trust_score_at_check: 1.0, decision_source: 'matrix' },
      rejection_reason: null, source: 'system',
      created_at: admin.firestore.Timestamp.fromDate(claimDate),
      resolved_at: admin.firestore.Timestamp.fromDate(new Date(claimDate.getTime() + 3000)),
    });

    // Current week rejected claim (1 day ago)
    const rejectDate = daysAgo(1);
    await db.collection('claims').doc('claim_demo_rejected').set({
      worker_id: demoUid, policy_id: 'policy_demo_current',
      zone_id: DEMO_ZONE_ID, dark_store_id: DEMO_DARK_STORE_ID,
      trigger_type: 'extreme_heat', trigger_event_id: null,
      risk_score: 18,
      income_loss: 330,
      scaled_payout: 204,
      coverage_ratio: 0.618,
      uncovered_loss: 330,
      payout_amount: 0,
      eligible_hours: 2.0,
      peer_consensus_ratio: 0.1, status: 'rejected',
      fraud_result: null,
      rejection_reason: 'Disruption not verified — risk score 18.0 below threshold of 40',
      source: 'rider',
      created_at: admin.firestore.Timestamp.fromDate(rejectDate),
      resolved_at: admin.firestore.Timestamp.fromDate(new Date(rejectDate.getTime() + 2000)),
    });

    const pendingDate = daysAgo(0);
    await db.collection('claims').doc('claim_demo_pending').set({
      worker_id: demoUid, policy_id: 'policy_demo_current',
      zone_id: DEMO_ZONE_ID, dark_store_id: DEMO_DARK_STORE_ID,
      trigger_type: 'unsafe_area', trigger_event_id: null,
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
      source: 'rider',
      created_at: admin.firestore.Timestamp.fromDate(pendingDate),
      resolved_at: null,
    });

    await db.collection('wallets').doc(demoUid).collection('transactions').add({
      type: 'payout', amount: 340,
      description: 'Claim approved — heavy rain',
      claim_id: 'claim_demo_current',
      created_at: admin.firestore.Timestamp.fromDate(claimDate),
    });
    await db.collection('wallets').doc(demoUid).collection('transactions').add({
      type: 'premium', amount: -89,
      description: 'Standard plan purchase',
      policy_id: 'policy_demo_current',
      created_at: admin.firestore.Timestamp.fromDate(curMonday),
    });
    await db.collection('wallets').doc(demoUid).collection('transactions').add({
      type: 'rebate', amount: 60,
      description: 'Weekly pool surplus rebate',
      created_at: admin.firestore.Timestamp.fromDate(daysAgo(1)),
    });
    await db.collection('wallets').doc(demoUid).collection('transactions').add({
      type: 'withdrawal', amount: -120,
      description: 'Wallet withdrawal',
      created_at: admin.firestore.Timestamp.fromDate(daysAgo(0)),
    });
  }

  // ── Pools — current week ────────────────────────────────────────────────────
  console.log('\n-- Seeding pools...');

  // Fixed current-week pools for dashboard
  const currentPools = [
    { id: DEMO_POOL_ID, dark_store_id: DEMO_DARK_STORE_ID, zone_id: DEMO_ZONE_ID, total_collected: 620, total_claimed: 340, surplus: 280, reserve_used: 0 },
    { id: 'pool_koramangala_current', dark_store_id: 'ds_koramangala', zone_id: 'zone_koramangala', total_collected: 3756, total_claimed: 1340, surplus: 2416, reserve_used: 0 },
    { id: 'pool_indiranagar_current', dark_store_id: 'ds_indiranagar', zone_id: 'zone_indiranagar', total_collected: 2240, total_claimed: 980, surplus: 1260, reserve_used: 0 },
    { id: 'pool_hsr_current', dark_store_id: 'ds_hsr', zone_id: 'zone_hsr', total_collected: 534, total_claimed: 460, surplus: 74, reserve_used: 0 },
    { id: 'pool_whitefield_current', dark_store_id: 'ds_whitefield', zone_id: 'zone_whitefield', total_collected: 890, total_claimed: 100, surplus: 790, reserve_used: 0 },
    { id: 'pool_electronic_current', dark_store_id: 'ds_electronic_city', zone_id: 'zone_electronic_city', total_collected: 600, total_claimed: 0, surplus: 600, reserve_used: 0 },
  ];

  for (const p of currentPools) {
    const { id, ...data } = p;
    await db.collection('pools').doc(id).set({
      ...data, week_start: curMonday, week_end: curSunday,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`  ✅ Pool: ${p.dark_store_id} — collected ₹${p.total_collected}, claimed ₹${p.total_claimed}`);
  }

  // Write accumulated historical pools
  for (const [key, data] of Object.entries(poolAccumulators)) {
    const safeId = key.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 100);
    await db.collection('pools').doc(safeId).set({
      ...data,
      surplus: Math.max(0, data.surplus),
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  console.log(`  ✅ ${Object.keys(poolAccumulators).length} historical pools written`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n🎉 Seed complete!\n');
  console.log(`  Demo rider : 9000000001 / Demo@1234  (auth email: ${authEmailFromPhone('9000000001')})`);
  console.log('  Admin      : admin@shiftsure.in / Admin@123');
  console.log(`  Raj Kumar  : 9876543210 / Rider@123  (auth email: ${authEmailFromPhone('9876543210')})`);
  console.log(`  Arjun Verma: 9876543212 / Rider@123  (auth email: ${authEmailFromPhone('9876543212')})`);
  console.log(`  Meena Rao  : 9876543213 / Rider@123  (auth email: ${authEmailFromPhone('9876543213')})`);

  console.log('\n  Seeded:');
  console.log(`    Zones         : ${zones.length}`);
  console.log(`    Dark Stores   : ${darkStores.length}`);
  console.log(`    Workers       : ${workerDefs.length + 1} (incl. admin)`);
  console.log(`    Trigger Events: ${HISTORICAL_EVENTS.length}`);
  console.log(`    Weeks of Data : 5 past + current (37 days total)`);

  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
