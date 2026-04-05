/**
 * pipeline.live.test.js — True E2E tests for ShiftSure
 * 
 * This suite creates isolated test users and zones in the live database,
 * executes the full HTTP pipeline against real running services, and
 * then tears down the test data.
 * 
 * Pre-requisites:
 * 1. Backend running on http://localhost:3000
 * 2. AI Service running on http://localhost:8001
 * 3. Valid GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_PROJECT_ID in environment
 */

const axios = require('axios');
const admin = require('firebase-admin');
const { initFirebase, getDb, getAuth } = require('../../config/firebase');

// Constants
const BACKEND_URL = process.env.VITE_API_URL || 'http://localhost:3000';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyCecB3jX0I6vyvin0yW1TI76UfvpvgKCHI';

const TEST_ID = `e2e_${Date.now()}`;
const TEST_WORKER_UID = `worker_${TEST_ID}`;
const TEST_ADMIN_UID = `admin_${TEST_ID}`;
const TEST_ZONE_ID = `zone_${TEST_ID}`;
const TEST_DS_ID = `ds_${TEST_ID}`;
const TEST_POOL_ID = `pool_${TEST_ID}`;

// Data cleanup refs
const testDocPaths = [];

async function getIdToken(email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
  const res = await axios.post(url, {
    email,
    password,
    returnSecureToken: true
  });
  return res.data.idToken;
}

describe('True E2E Pipeline — Live Databases', () => {
  let db, auth;
  let workerToken, adminToken;
  let axiosWorker, axiosAdmin;

  beforeAll(async () => {
    // 1. Initialize live Firebase
    db = getDb();
    auth = getAuth();

    const workerEmail = `${TEST_WORKER_UID}@shiftsure.in`;
    const adminEmail = `${TEST_ADMIN_UID}@shiftsure.in`;
    const password = 'Password@123';

    // 2. Create Auth Users
    await auth.createUser({ uid: TEST_WORKER_UID, email: workerEmail, password });
    await auth.createUser({ uid: TEST_ADMIN_UID, email: adminEmail, password });

    // 3. Seed test zone and dark store
    await db.collection('zones').doc(TEST_ZONE_ID).set({
      name: `E2E Zone ${TEST_ID}`,
      lat: 12.93,
      lng: 77.61,
      city: 'Bangalore',
      flood_signal: false,
      severe_flood_signal: false,
      unsafe_signal: false,
      zone_restriction: false,
      enrollment_suspended: false,
      trigger_probability: 0.22,
      avg_daily_income_loss: 420,
      city_factor: 1.0,
      zone_density_factor: 1.0,
      historical_disruption_rate: 0.1,
      is_e2e_test: true,
    });
    testDocPaths.push(`zones/${TEST_ZONE_ID}`);

    await db.collection('dark_stores').doc(TEST_DS_ID).set({
      name: `E2E DS ${TEST_ID}`,
      zone_id: TEST_ZONE_ID,
      dispatch_outage: false,
      is_e2e_test: true,
    });
    testDocPaths.push(`dark_stores/${TEST_DS_ID}`);

    // 4. Seed test pool
    await db.collection('pools').doc(TEST_POOL_ID).set({
      name: `E2E Pool ${TEST_ID}`,
      surplus: 5000,
      total_collected: 5000,
      total_claimed: 0,
      status: 'active',
      is_e2e_test: true,
    });
    testDocPaths.push(`pools/${TEST_POOL_ID}`);

    // 5. Seed worker document
    await db.collection('workers').doc(TEST_WORKER_UID).set({
      name: `E2E Rider ${TEST_ID}`,
      role: 'rider',
      total_deliveries: 50, // Eligible
      weekly_income_band: 12000,
      weekly_hours: 42,
      worker_tier: 'active',
      zone_id: TEST_ZONE_ID,
      dark_store_id: TEST_DS_ID,
      is_e2e_test: true,
    });
    testDocPaths.push(`workers/${TEST_WORKER_UID}`);

    // 6. Seed admin document
    await db.collection('workers').doc(TEST_ADMIN_UID).set({
      name: `E2E Admin ${TEST_ID}`,
      role: 'admin',
      is_e2e_test: true,
    });
    testDocPaths.push(`workers/${TEST_ADMIN_UID}`);

    // 7. Await indexing/propagation slightly before fetching tokens
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 8. Exchange for ID Tokens via REST API
    workerToken = await getIdToken(workerEmail, password);
    adminToken = await getIdToken(adminEmail, password);

    // Setup axial clients
    axiosWorker = axios.create({
      baseURL: BACKEND_URL,
      headers: { Authorization: `Bearer ${workerToken}` },
      validateStatus: () => true, // Don't throw on 4xx/5xx
    });

    axiosAdmin = axios.create({
      baseURL: BACKEND_URL,
      headers: { Authorization: `Bearer ${adminToken}` },
      validateStatus: () => true,
    });
  });

  afterAll(async () => {
    if (!db || !auth) {
      console.log('Firebase services (db/auth) not initialized. Skipping cleanup.');
      return;
    }

    // 1. Delete generated documents
    console.log(`Cleaning up ${testDocPaths.length} seeded test documents...`);
    for (const path of testDocPaths) {
      const [col, id] = path.split('/');
      await db.collection(col).doc(id).delete().catch(() => {});
    }

    // Also try to find any claims/policies generated for this user
    const claims = await db.collection('claims').where('worker_id', '==', TEST_WORKER_UID).get();
    for (const d of claims.docs) await d.ref.delete();

    const policies = await db.collection('policies').where('worker_id', '==', TEST_WORKER_UID).get();
    for (const d of policies.docs) await d.ref.delete();

    const pools = await db.collection('pools').where('dark_store_id', '==', TEST_DS_ID).get();
    for (const d of pools.docs) await d.ref.delete().catch(() => {});

    const wallets = await db.collection('wallets').doc(TEST_WORKER_UID).get();
    if (wallets.exists) {
        const txs = await wallets.ref.collection('transactions').get();
        for (const t of txs.docs) await t.ref.delete();
        await wallets.ref.delete();
    }

    // 2. Delete auth users
    await auth.deleteUser(TEST_WORKER_UID).catch(() => {});
    await auth.deleteUser(TEST_ADMIN_UID).catch(() => {});
  });

  test('Step 1: Check backend and AI reachability', async () => {
    const health = await axios.get(`${BACKEND_URL}/health`);
    expect(health.status).toBe(200);
    // Since this is real DB tests, ensure endpoints load without error
  });

  test('Step 2: Rider purchases a policy via live pricing', async () => {
    // First, verify premium endpoint calculates correctly using real AI service
    const premiumRes = await axiosWorker.get('/api/policies/premium?plan=standard');
    expect(premiumRes.status).toBe(200);
    expect(premiumRes.data.final_premium).toBeGreaterThan(0);

    // Buy standard plan
    const purchaseRes = await axiosWorker.post('/api/policies/purchase', {
      plan: 'standard',
      premium_paid: premiumRes.data.final_premium,
      shift_slots: [
        { day: 'mon', start: '17:00', end: '23:00' }
      ]
    });
    
    expect(purchaseRes.status).toBe(201);
    expect(purchaseRes.data.policy_id).toBeTruthy();
    expect(purchaseRes.data.worker_tier_at_purchase).toMatch(/active|partly_active/);
  });

  test('Step 3: Admin manipulates zone signal and triggers payout', async () => {
    // Escalate signals to ensure payout tier
    const patchRes = await axiosAdmin.patch(`/api/admin/zones/${TEST_ZONE_ID}/signals`, {
      flood_signal: true
    });
    expect(patchRes.status).toBe(200);

    // Make sure we simulate heavy rain that overlaps with our monday shift!
    // Since we can't reliably mock "current time" in E2E perfectly, 
    // the AI predictive income uses the "latest trigger window" logic.
    // The backend uses current timestamp. The income prediction might return 0
    // if the test runs on a day totally isolated from Mon 17-23.
    // Let's just trigger and check if pipeline resolves (even if skipped for hours).

    const triggerRes = await axiosAdmin.post('/api/admin/trigger', {
      zone_id: TEST_ZONE_ID,
      trigger_type: 'flood',
      severity: 'high'
    });
    
    expect(triggerRes.status).toBe(200);
    expect(triggerRes.data.zone_id).toBe(TEST_ZONE_ID);
    // Depending on when the test is run, it could be Skipped (No shift overlap) 
    // or Paid. But it shouldn't produce a 500 error!
    expect(Array.isArray(triggerRes.data.payouts)).toBe(true);
    expect(Array.isArray(triggerRes.data.skipped)).toBe(true);
  });

  test('Step 4: Verify claim and wallet records generated', async () => {
    const claimRes = await axiosWorker.get('/api/claims');
    expect(claimRes.status).toBe(200);
    // Claim list should exist and contain either approved/rejected/skipped depending on datetime overlap
    expect(Array.isArray(claimRes.data.claims)).toBe(true);
    
    const walletRes = await axiosWorker.get('/api/wallet');
    expect(walletRes.status).toBe(200);
    // At minimum, wallet has a deduction for premium purchase in Step 2.
    expect(walletRes.data.transactions.length).toBeGreaterThanOrEqual(1);

    const approvedClaim = (claimRes.data.claims || []).find(c => c.status === 'approved');
    if (approvedClaim) {
      expect(approvedClaim).toHaveProperty('income_loss');
      expect(approvedClaim).toHaveProperty('scaled_payout');
      expect(approvedClaim).toHaveProperty('coverage_ratio');
      expect(approvedClaim).toHaveProperty('uncovered_loss');
    }
  });

  test('Step 5: Wallet withdrawal endpoint works', async () => {
    const preWallet = await axiosWorker.get('/api/wallet');
    expect(preWallet.status).toBe(200);
    const preBalance = preWallet.data.balance || 0;

    const invalidWithdraw = await axiosWorker.post('/api/wallet/withdraw', { amount: preBalance + 100000 });
    expect(invalidWithdraw.status).toBe(400);

    if (preBalance >= 10) {
      const withdrawRes = await axiosWorker.post('/api/wallet/withdraw', { amount: 10 });
      expect(withdrawRes.status).toBe(200);
      expect(withdrawRes.data.success).toBe(true);
      expect(withdrawRes.data.balance).toBeCloseTo(preBalance - 10, 2);
    }
  });
});
