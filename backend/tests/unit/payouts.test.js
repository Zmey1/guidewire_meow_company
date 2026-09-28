/**
 * Payment + claim safety tests (no network, no live Firebase).
 * Covers: missing wallets, duplicate/concurrent payouts, weekly cap races,
 * fraud-service failures, repeated admin overrides and duplicate filing.
 */

const express = require('express');
const request = require('supertest');
const { FakeFirestore } = require('../helpers/fakeFirestore');

let mockDb;

jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: require('../helpers/fakeFirestore').FieldValue },
}));
jest.mock('../../config/firebase', () => ({
  getDb: () => mockDb,
  getAuth: () => ({}),
  initFirebase: () => mockDb,
}));
jest.mock('../../services/aiService', () => ({
  getRiskScore: jest.fn(),
  predictIncome: jest.fn(),
  fraudCheck: jest.fn(),
  calculatePremium: jest.fn(),
}));
jest.mock('../../services/owmService', () => ({ fetchWeather: jest.fn() }));
jest.mock('../../services/zoneService', () => ({
  checkAndSuspendZoneIfNeeded: jest.fn().mockResolvedValue({ suspended: false }),
  calculateZoneMetrics: jest.fn(),
  setZoneEnrollmentSuspension: jest.fn(),
}));
jest.mock('../../middleware/adminAuth', () => (req, _res, next) => { req.uid = 'admin1'; req.role = 'admin'; next(); });
jest.mock('../../middleware/auth', () => (req, _res, next) => {
  req.uid = req.headers['x-test-uid'] || 'w1';
  req.role = 'rider';
  req.workerData = mockDb.data(`workers/${req.uid}`) || null;
  next();
});

const ai = require('../../services/aiService');
const { creditClaimPayout } = require('../../services/payoutService');
const { verificationPipeline } = require('../../services/verificationPipeline');
const { runManualTrigger } = require('../../services/triggerEngine');

function app(path, router) {
  const a = express();
  a.use(express.json());
  a.use(path, router);
  return a;
}

const balance = (uid) => (mockDb.data(`wallets/${uid}`) || {}).balance;
const ledger = (uid) => mockDb.paths(`wallets/${uid}/transactions/`);

function yesterdaySlot() {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return { day: days[(new Date().getDay() + 6) % 7], start: '00:00', end: '23:59' };
}

beforeEach(() => {
  mockDb = new FakeFirestore();
  jest.clearAllMocks();
  delete process.env.PAYOUT_MODE;

  mockDb.seed('workers/w1', { name: 'Rider One', phone: '9000000001', zone_id: 'z1', dark_store_id: 'ds1', total_deliveries: 50, weekly_income_band: 12000, weekly_hours: 40 });
  mockDb.seed('zones/z1', { lat: 12.9, lng: 77.6, flood_signal: true });
  mockDb.seed('dark_stores/ds1', { zone_id: 'z1' });
  mockDb.seed('pools/pool1', { total_collected: 1000, total_claimed: 0, surplus: 1000 });
  mockDb.seed('policies/p1', {
    worker_id: 'w1', zone_id: 'z1', status: 'active', pool_id: 'pool1',
    weekly_cap: 2400, effective_weekly_cap: 2400, payouts_issued_this_week: 0,
    shift_slots: [yesterdaySlot()],
  });
  // NB: no wallets/w1 document — payouts must create it.
});

// ── payoutService ────────────────────────────────────────────────────────────

describe('creditClaimPayout', () => {
  test('creates a missing wallet and writes claim, ledger, policy and pool atomically', async () => {
    mockDb.seed('claims/c1', { worker_id: 'w1', status: 'pending_verification' });

    const r = await creditClaimPayout(mockDb, {
      claimRef: mockDb.collection('claims').doc('c1'), workerId: 'w1', policyId: 'p1', poolId: 'pool1',
      payoutAmount: 500, description: 'test', allowedStatuses: ['pending_verification'],
    });

    expect(r).toEqual({ credited: true, amount: 500 });
    expect(balance('w1')).toBe(500);
    expect(mockDb.data('claims/c1').status).toBe('approved');
    expect(mockDb.data('wallets/w1/transactions/payout_c1')).toMatchObject({ amount: 500, provider: 'simulated' });
    expect(mockDb.data('policies/p1').payouts_issued_this_week).toBe(500);
    expect(mockDb.data('pools/pool1').total_claimed).toBe(500);
  });

  test('retrying the same claim never pays twice', async () => {
    mockDb.seed('claims/c1', { worker_id: 'w1', status: 'pending_verification' });
    const args = { claimRef: mockDb.collection('claims').doc('c1'), workerId: 'w1', policyId: 'p1', payoutAmount: 300, description: 't' };

    await creditClaimPayout(mockDb, args);
    const again = await creditClaimPayout(mockDb, args);

    expect(again).toMatchObject({ credited: false, reason: 'already_paid' });
    expect(balance('w1')).toBe(300);
    expect(ledger('w1')).toHaveLength(1);
  });

  test('10 concurrent credits of one claim produce exactly one payout', async () => {
    mockDb.seed('claims/c1', { worker_id: 'w1', status: 'pending_verification' });
    const args = { claimRef: mockDb.collection('claims').doc('c1'), workerId: 'w1', policyId: 'p1', payoutAmount: 300, description: 't' };

    const results = await Promise.all(Array.from({ length: 10 }, () => creditClaimPayout(mockDb, args)));

    expect(results.filter((r) => r.credited)).toHaveLength(1);
    expect(balance('w1')).toBe(300);
    expect(mockDb.data('policies/p1').payouts_issued_this_week).toBe(300);
  });

  test('concurrent different claims cannot exceed the weekly cap', async () => {
    const claims = ['a', 'b', 'c', 'd', 'e'];
    claims.forEach((id) => mockDb.seed(`claims/${id}`, { worker_id: 'w1', status: 'pending_verification' }));

    const results = await Promise.all(claims.map((id) => creditClaimPayout(mockDb, {
      claimRef: mockDb.collection('claims').doc(id), workerId: 'w1', policyId: 'p1', payoutAmount: 1000, description: 't',
    })));

    const paid = results.reduce((s, r) => s + r.amount, 0);
    expect(paid).toBe(2400);
    expect(balance('w1')).toBe(2400);
    expect(mockDb.data('policies/p1').payouts_issued_this_week).toBe(2400);
    expect(results.filter((r) => r.reason === 'cap_reached').length).toBeGreaterThan(0);
  });

  test('refuses claims not in an allowed status', async () => {
    mockDb.seed('claims/c1', { worker_id: 'w1', status: 'rejected' });
    const r = await creditClaimPayout(mockDb, {
      claimRef: mockDb.collection('claims').doc('c1'), workerId: 'w1', payoutAmount: 100, description: 't',
      allowedStatuses: ['pending_verification'],
    });
    expect(r).toMatchObject({ credited: false, reason: 'invalid_status' });
    expect(balance('w1')).toBeUndefined();
  });
});

// ── verificationPipeline ────────────────────────────────────────────────────

describe('verificationPipeline', () => {
  const worker = () => ({ uid: 'w1', ...mockDb.data('workers/w1') });
  const policy = () => ({ id: 'p1', ...mockDb.data('policies/p1') });

  beforeEach(() => {
    mockDb.seed('claims/c1', { worker_id: 'w1', zone_id: 'z1', trigger_type: 'flood', status: 'pending_verification', created_at: new Date() });
    ai.getRiskScore.mockResolvedValue({ risk_score: 75, tier: 'tier2', expected_loss: 10 });
    ai.predictIncome.mockResolvedValue({ eligible_hours: 2, income_loss: 600, scaled_payout: 400, coverage_ratio: 0.66 });
  });

  const run = () => verificationPipeline('c1', worker(), policy(), { id: 'z1', ...mockDb.data('zones/z1') }, { id: 'ds1' });

  test('fraud service error -> pending_review, no payout', async () => {
    ai.fraudCheck.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await run();
    expect(mockDb.data('claims/c1')).toMatchObject({ status: 'pending_review', payout_amount: 400 });
    expect(mockDb.data('claims/c1').review_reason).toMatch(/Fraud check unavailable/);
    expect(balance('w1')).toBeUndefined();
  });

  test('fraud service reports pending_review (Neo4j down) -> pending_review, no payout', async () => {
    ai.fraudCheck.mockResolvedValue({ decision: 'pending_review', fraud_result: { decision_source: 'fallback_no_graph' } });
    await run();
    expect(mockDb.data('claims/c1').status).toBe('pending_review');
    expect(balance('w1')).toBeUndefined();
  });

  test('AI service down before fraud step -> pending_review, not rejected', async () => {
    ai.getRiskScore.mockRejectedValue(new Error('timeout'));
    await run();
    expect(mockDb.data('claims/c1').status).toBe('pending_review');
  });

  test('approved -> wallet created and credited once even if pipeline re-runs', async () => {
    ai.fraudCheck.mockResolvedValue({ decision: 'approved', fraud_result: { ring_detected: 'none' } });
    await run();
    await run();
    expect(mockDb.data('claims/c1')).toMatchObject({ status: 'approved', payout_amount: 400 });
    expect(balance('w1')).toBe(400);
    expect(ledger('w1')).toHaveLength(1);
  });

  test('fraud rejection -> rejected, no payout', async () => {
    ai.fraudCheck.mockResolvedValue({ decision: 'rejected', fraud_result: { ring_detected: 'hard', graph_anomaly_score: 0, trust_score_at_check: 1 } });
    await run();
    expect(mockDb.data('claims/c1')).toMatchObject({ status: 'rejected', rejection_reason: 'Coordinated claim ring detected' });
    expect(balance('w1')).toBeUndefined();
  });
});

// ── triggerEngine ───────────────────────────────────────────────────────────

describe('runManualTrigger', () => {
  beforeEach(() => {
    ai.getRiskScore.mockResolvedValue({ risk_score: 80, tier: 'full', expected_loss: 12 });
    ai.predictIncome.mockResolvedValue({ eligible_hours: 2, income_loss: 600, scaled_payout: 400, coverage_ratio: 0.66 });
  });

  test('fraud service error -> claim held in pending_review, no wallet credit', async () => {
    ai.fraudCheck.mockRejectedValue(new Error('503'));
    const summary = await runManualTrigger({ zone_id: 'z1', trigger_type: 'flood', triggeredBy: 'admin1' });

    expect(summary.payouts).toHaveLength(0);
    const claimPath = mockDb.paths('claims/')[0];
    expect(mockDb.data(claimPath).status).toBe('pending_review');
    expect(balance('w1')).toBeUndefined();
  });

  test('approved -> one payout to a previously missing wallet', async () => {
    ai.fraudCheck.mockResolvedValue({ decision: 'approved', fraud_result: { ring_detected: 'none' } });
    const summary = await runManualTrigger({ zone_id: 'z1', trigger_type: 'flood', triggeredBy: 'admin1' });
    expect(summary.payouts).toHaveLength(1);
    expect(balance('w1')).toBe(400);
  });
});

// ── Admin override ───────────────────────────────────────────────────────────

describe('POST /api/admin/claims/:id/override', () => {
  const adminApp = () => app('/api/admin', require('../../routes/admin'));

  beforeEach(() => {
    mockDb.seed('claims/c1', { worker_id: 'w1', policy_id: 'p1', status: 'pending_review', payout_amount: 350 });
  });

  test('repeated overrides credit once; the second is refused', async () => {
    const a = adminApp();
    const first = await request(a).post('/api/admin/claims/c1/override').send({ reason: 'verified manually' });
    const second = await request(a).post('/api/admin/claims/c1/override').send({ reason: 'double click' });

    expect(first.status).toBe(200);
    expect(first.body.payout_credited).toBe(350);
    expect(second.status).toBe(400); // claim is now 'approved' -> fails the status pre-check
    expect(balance('w1')).toBe(350);
    expect(ledger('w1')).toHaveLength(1);
  });

  test('concurrent overrides credit once', async () => {
    const a = adminApp();
    const results = await Promise.all(Array.from({ length: 5 }, () =>
      request(a).post('/api/admin/claims/c1/override').send({ reason: 'race' })));

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400 || r.status === 409)).toHaveLength(4);
    expect(balance('w1')).toBe(350);
    expect(ledger('w1')).toHaveLength(1);
  });
});

// ── Claim filing ──────────────────────────────────────────────────────────────

describe('POST /api/claims/file', () => {
  beforeEach(() => {
    ai.getRiskScore.mockResolvedValue({ risk_score: 75, tier: 'tier2', expected_loss: 10 });
    ai.predictIncome.mockResolvedValue({ eligible_hours: 2, income_loss: 600, scaled_payout: 400, coverage_ratio: 0.66 });
    ai.fraudCheck.mockResolvedValue({ decision: 'approved', fraud_result: { ring_detected: 'none' } });
  });

  test('concurrent duplicate filings create exactly one claim and one payout', async () => {
    const a = app('/api/claims', require('../../routes/claims'));
    const results = await Promise.all(Array.from({ length: 4 }, () =>
      request(a).post('/api/claims/file').send({ trigger_type: 'flood' })));

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 429)).toHaveLength(3);
    expect(mockDb.paths('claims/')).toHaveLength(1);
    expect(balance('w1')).toBe(400);
  });

  test('verification completes before the response (no background work)', async () => {
    const a = app('/api/claims', require('../../routes/claims'));
    const res = await request(a).post('/api/claims/file').send({ trigger_type: 'flood' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'approved', payout_amount: 400 });
  });

  test('fraud outage -> response reports pending_review', async () => {
    ai.fraudCheck.mockRejectedValue(new Error('down'));
    const a = app('/api/claims', require('../../routes/claims'));
    const res = await request(a).post('/api/claims/file').send({ trigger_type: 'flood' });
    expect(res.body.status).toBe('pending_review');
    expect(balance('w1')).toBeUndefined();
  });
});

// ── Wallet withdrawals ──────────────────────────────────────────────────────

describe('POST /api/wallet/withdraw (simulated default)', () => {
  let rzp;
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../services/razorpayXService', () => {
      const actual = jest.requireActual('../../services/razorpayXService');
      const boom = jest.fn(() => { throw new Error('real payment API must not be called'); });
      return { ...actual, createContact: boom, createVpaFundAccount: boom, createPayoutToVpa: boom, fetchPayoutById: boom };
    });
    rzp = require('../../services/razorpayXService');
    mockDb.seed('wallets/w1', { balance: 1000 });
  });

  afterEach(() => {
    delete process.env.RAZORPAYX_KEY_ID;
    delete process.env.RAZORPAYX_KEY_SECRET;
    delete process.env.RAZORPAYX_ACCOUNT_NUMBER;
  });

  const walletApp = () => app('/api/wallet', require('../../routes/wallet'));

  test('stays simulated even when RazorpayX keys are present but PAYOUT_MODE is unset', async () => {
    process.env.RAZORPAYX_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAYX_KEY_SECRET = 'x';
    process.env.RAZORPAYX_ACCOUNT_NUMBER = '1';

    const res = await request(walletApp()).post('/api/wallet/withdraw').send({ amount: 200, upi_id: 'rider@okbank' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ provider: 'simulated', balance: 800 });
    expect(rzp.createPayoutToVpa).not.toHaveBeenCalled();
    expect(rzp.createContact).not.toHaveBeenCalled();

    const wallet = await request(walletApp()).get('/api/wallet');
    expect(wallet.body.withdrawal_profile).toMatchObject({ provider: 'simulated', ready: true });
    expect(rzp.fetchPayoutById).not.toHaveBeenCalled();
  });

  test('retries with the same Idempotency-Key debit once', async () => {
    const a = walletApp();
    const send = () => request(a).post('/api/wallet/withdraw').set('Idempotency-Key', 'req-123').send({ amount: 300, upi_id: 'rider@okbank' });
    const results = await Promise.all([send(), send(), send()]);

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(balance('w1')).toBe(700);
    expect(ledger('w1')).toHaveLength(1);
  });

  test('concurrent withdrawals cannot overdraw', async () => {
    const a = walletApp();
    const results = await Promise.all(Array.from({ length: 5 }, () =>
      request(a).post('/api/wallet/withdraw').send({ amount: 400, upi_id: 'rider@okbank' })));

    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    expect(results.filter((r) => r.status === 400)).toHaveLength(3);
    expect(balance('w1')).toBe(200);
  });

  test('razorpay webhook is disabled in simulated mode', async () => {
    const res = await request(walletApp()).post('/api/wallet/webhooks/razorpay').send({});
    expect(res.status).toBe(404);
  });
});
