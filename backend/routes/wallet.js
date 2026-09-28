const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getDb } = require('../config/firebase');
const admin = require('firebase-admin');
const {
  RazorpayXError,
  createContact,
  fetchPayoutById,
  createPayoutToVpa,
  createVpaFundAccount,
  generateIdempotencyKey,
  isRazorpayXConfigured,
  isValidUpiId,
  mapPayoutStatusToWalletStatus,
  normalizeUpiId,
  sanitizeEmail,
  verifyWebhookSignature,
} = require('../services/razorpayXService');

function toWholeRupees(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}

function buildWithdrawalDescription(upiId) {
  return `UPI withdrawal to ${normalizeUpiId(upiId)}`;
}

// Real money only moves when PAYOUT_MODE=razorpayx is set server-side AND the
// RazorpayX keys are present. Anything else (including unset) is simulated:
// the wallet ledger is updated and no payment provider is ever called.
function isLivePayoutMode() {
  return String(process.env.PAYOUT_MODE || 'simulated').trim().toLowerCase() === 'razorpayx';
}

function buildWithdrawalProfile(worker = {}) {
  const live = isLivePayoutMode();
  return {
    provider: live ? 'razorpayx' : 'simulated',
    ready: live ? isRazorpayXConfigured() : true,
    upi_id: normalizeUpiId(worker.upi_id || worker.razorpay_fund_account_upi || ''),
  };
}

function buildFailureStatus(description, source = 'system', reason = 'request_failed') {
  return { description, source, reason };
}

function shouldPollWithdrawalStatus(withdrawal = {}) {
  const status = String(withdrawal.status || '').toLowerCase();
  return (
    withdrawal.provider === 'razorpayx' &&
    Boolean(withdrawal.provider_payout_id) &&
    ['initiated', 'pending', 'queued', 'processing'].includes(status)
  );
}

function shouldKeepExistingFinalStatus(currentStatus, nextStatus) {
  const current = String(currentStatus || '').toLowerCase();
  const next = String(nextStatus || '').toLowerCase();

  if (!current) return false;

  if (['reversed', 'failed', 'cancelled'].includes(current) && next === 'processed') {
    return true;
  }

  if (current === 'processed' && ['pending', 'queued', 'processing'].includes(next)) {
    return true;
  }

  return false;
}

function shouldSkipProviderSync(lastSyncedAt) {
  if (!lastSyncedAt || lastSyncedAt._seconds == null) {
    return false;
  }

  const lastSyncMs = Number(lastSyncedAt._seconds) * 1000;
  const minGapMs = 15 * 1000;
  return (Date.now() - lastSyncMs) < minGapMs;
}

async function ensureRazorpayDestination({ workerRef, workerId, worker, upiId, fallbackEmail }) {
  let contactId = worker.razorpay_contact_id || null;
  let fundAccountId = worker.razorpay_fund_account_id || null;
  const normalizedUpiId = normalizeUpiId(upiId);
  const workerName = worker.name || 'ShiftSure Rider';
  const workerPhone = worker.phone;
  const workerEmail = sanitizeEmail(
    worker.email || fallbackEmail,
    worker.phone || workerId,
  );

  if (!workerPhone) {
    throw new Error('Worker phone number is required for RazorpayX payouts');
  }

  if (!contactId) {
    const contact = await createContact({
      name: workerName,
      phone: workerPhone,
      email: workerEmail,
      referenceId: `worker_${String(workerId).slice(0, 33)}`,
      notes: {
        worker_uid: String(workerId),
      },
    });

    contactId = contact.id;
    await workerRef.set({
      email: workerEmail,
      razorpay_contact_id: contact.id,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  if (!fundAccountId || normalizeUpiId(worker.razorpay_fund_account_upi) !== normalizedUpiId) {
    const fundAccount = await createVpaFundAccount({
      contactId,
      upiId: normalizedUpiId,
    });

    fundAccountId = fundAccount.id;
    await workerRef.set({
      upi_id: normalizedUpiId,
      razorpay_fund_account_id: fundAccount.id,
      razorpay_fund_account_upi: normalizedUpiId,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return { contactId, fundAccountId, workerEmail };
}

async function markWithdrawalAsReleased({
  walletRef,
  txRef,
  requestedAmount,
  finalStatus,
  providerStatus,
  failureReason,
  statusDetails,
}) {
  const db = getDb();

  await db.runTransaction(async (tx) => {
    const [walletDoc, txDoc] = await Promise.all([
      tx.get(walletRef),
      tx.get(txRef),
    ]);

    if (!txDoc.exists) {
      return;
    }

    const wallet = walletDoc.exists ? (walletDoc.data() || {}) : {};
    const withdrawal = txDoc.data() || {};
    const effectiveAmount = toWholeRupees(withdrawal.requested_amount || requestedAmount);
    const alreadyRefunded = toWholeRupees(withdrawal.refunded_amount) >= effectiveAmount;
    const currentBalance = toWholeRupees(wallet.balance);

    if (!alreadyRefunded && effectiveAmount > 0) {
      tx.set(walletRef, {
        balance: currentBalance + effectiveAmount,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    tx.set(txRef, {
      amount: 0,
      refunded_amount: effectiveAmount,
      status: finalStatus,
      provider_status: providerStatus,
      failure_reason: failureReason,
      status_details: statusDetails,
      refund_processed_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function syncWithdrawalWithPayout({
  walletRef,
  txRef,
  payout,
}) {
  const db = getDb();
  const nextStatus = mapPayoutStatusToWalletStatus(payout.status);

  await db.runTransaction(async (tx) => {
    const txDoc = await tx.get(txRef);
    if (!txDoc.exists) {
      return;
    }

    const current = txDoc.data() || {};
    const currentStatus = String(current.status || '').toLowerCase();
    const effectiveRequestedAmount = toWholeRupees(
      current.requested_amount || Math.abs(current.amount),
    );

    if (!shouldKeepExistingFinalStatus(currentStatus, nextStatus)) {
      tx.set(txRef, {
        status: nextStatus,
        provider_status: String(payout.status || '').toLowerCase(),
        provider_payout_id: payout.id || current.provider_payout_id || null,
        provider_fund_account_id: payout.fund_account_id || current.provider_fund_account_id || null,
        utr: payout.utr || current.utr || null,
        status_details: payout.status_details || current.status_details || null,
        last_provider_sync_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } else {
      tx.set(txRef, {
        last_provider_sync_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    if (['failed', 'reversed', 'cancelled'].includes(nextStatus)) {
      const walletDoc = await tx.get(walletRef);
      const wallet = walletDoc.exists ? (walletDoc.data() || {}) : {};
      const alreadyRefunded =
        toWholeRupees(current.refunded_amount) >= effectiveRequestedAmount;

      if (!alreadyRefunded && effectiveRequestedAmount > 0) {
        const currentBalance = toWholeRupees(wallet.balance);
        tx.set(walletRef, {
          balance: currentBalance + effectiveRequestedAmount,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      tx.set(txRef, {
        amount: 0,
        refunded_amount: effectiveRequestedAmount,
        status: nextStatus,
        provider_status: String(payout.status || '').toLowerCase(),
        failure_reason: (
          payout.status_details &&
          payout.status_details.description
        ) || current.failure_reason || 'Withdrawal could not be completed',
        status_details: payout.status_details || current.status_details || null,
        refund_processed_at: admin.firestore.FieldValue.serverTimestamp(),
        last_provider_sync_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });
}

async function syncPendingRazorpayWithdrawals({
  walletRef,
  transactionDocs,
}) {
  if (!isLivePayoutMode() || !isRazorpayXConfigured()) {
    return false;
  }

  let syncedAny = false;

  for (const doc of transactionDocs) {
    const withdrawal = doc.data() || {};

    if (!shouldPollWithdrawalStatus(withdrawal)) {
      continue;
    }

    if (shouldSkipProviderSync(withdrawal.last_provider_sync_at)) {
      continue;
    }

    try {
      const payout = await fetchPayoutById(withdrawal.provider_payout_id);
      await syncWithdrawalWithPayout({
        walletRef,
        txRef: doc.ref,
        payout,
      });
      syncedAny = true;
    } catch (err) {
      await doc.ref.set({
        provider_sync_error: err.message,
        last_provider_sync_attempt_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  return syncedAny;
}

// POST /api/wallet/webhooks/razorpay
router.post('/webhooks/razorpay', async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAYX_WEBHOOK_SECRET;
    const signature = req.get('X-Razorpay-Signature');

    if (!isLivePayoutMode()) {
      return res.status(404).json({ error: 'RazorpayX payouts are disabled' });
    }

    if (!webhookSecret) {
      return res.status(503).json({ error: 'RazorpayX webhook secret is not configured' });
    }

    if (!verifyWebhookSignature(req.rawBody, signature, webhookSecret)) {
      return res.status(400).json({ error: 'Invalid RazorpayX webhook signature' });
    }

    const payload = req.body && req.body.payload;
    const payoutContainer = payload && payload.payout;
    const payout = payoutContainer && payoutContainer.entity;
    if (!payout) {
      return res.json({ received: true, ignored: true });
    }

    const notes = payout.notes || {};
    const workerId = String(notes.worker_uid || '').trim();
    const txId = String(notes.wallet_tx_id || payout.reference_id || '').trim();

    if (!workerId || !txId) {
      return res.json({ received: true, ignored: true });
    }

    const db = getDb();
    const walletRef = db.collection('wallets').doc(workerId);
    const txRef = walletRef.collection('transactions').doc(txId);
    await syncWithdrawalWithPayout({
      walletRef,
      txRef,
      payout,
    });

    return res.json({ received: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/wallet
router.get('/', auth, async (req, res) => {
  try {
    const db = getDb();
    const walletRef = db.collection('wallets').doc(req.uid);
    const workerRef = db.collection('workers').doc(req.uid);
    let txSnap = await walletRef
      .collection('transactions')
      .orderBy('created_at', 'desc')
      .limit(100)
      .get();

    await syncPendingRazorpayWithdrawals({
      walletRef,
      transactionDocs: txSnap.docs,
    });

    const [walletDoc, workerDoc, refreshedTxSnap] = await Promise.all([
      walletRef.get(),
      workerRef.get(),
      walletRef
        .collection('transactions')
        .orderBy('created_at', 'desc')
        .limit(100)
        .get(),
    ]);
    txSnap = refreshedTxSnap;

    const walletData = walletDoc.exists ? (walletDoc.data() || {}) : {};
    const workerData = workerDoc.exists ? (workerDoc.data() || {}) : (req.workerData || {});

    const transactions = txSnap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        ...data,
        amount: toWholeRupees(data.amount),
        requested_amount: toWholeRupees(data.requested_amount),
        refunded_amount: toWholeRupees(data.refunded_amount),
      };
    });

    return res.json({
      balance: toWholeRupees(walletData.balance),
      transactions,
      withdrawal_profile: buildWithdrawalProfile(workerData),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Simulated withdrawal: debit + ledger entry in one transaction, no provider call.
// An optional Idempotency-Key header (or body.request_id) makes client retries safe.
async function simulateWithdrawal(req, res, { amount, upiId }) {
  const db = getDb();
  const walletRef = db.collection('wallets').doc(req.uid);
  const requestKey = String(req.get('Idempotency-Key') || req.body.request_id || '')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 64);
  const txRef = requestKey
    ? walletRef.collection('transactions').doc(`wd_${requestKey}`)
    : walletRef.collection('transactions').doc();

  let updatedBalance = 0;
  let replayed = false;

  await db.runTransaction(async (tx) => {
    const [walletDoc, existingTx] = await Promise.all([tx.get(walletRef), tx.get(txRef)]);
    const currentBalance = toWholeRupees(walletDoc.exists ? walletDoc.data().balance : 0);

    if (existingTx.exists) {
      replayed = true;
      updatedBalance = currentBalance;
      return;
    }

    if (amount > currentBalance) {
      const err = new Error('Insufficient balance for withdrawal');
      err.code = 'INSUFFICIENT_BALANCE';
      throw err;
    }

    updatedBalance = currentBalance - amount;
    tx.set(walletRef, {
      balance: updatedBalance,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.create(txRef, {
      type: 'withdrawal',
      amount: -amount,
      requested_amount: amount,
      refunded_amount: 0,
      status: 'processed',
      provider: 'simulated',
      provider_status: 'simulated',
      description: `${buildWithdrawalDescription(upiId)} (simulated)`,
      worker_id: req.uid,
      upi_id: upiId,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return res.json({
    success: true,
    pending: false,
    status: 'processed',
    amount_withdrawn: amount,
    balance: updatedBalance,
    provider: 'simulated',
    reference_id: txRef.id,
    replayed,
    message: `Simulated withdrawal of ₹${amount} to ${upiId} — no real money moved`,
  });
}

// POST /api/wallet/withdraw
router.post('/withdraw', auth, async (req, res) => {
  const amount = toWholeRupees(req.body.amount);
  const upiId = normalizeUpiId(
    req.body.upi_id || (req.workerData && req.workerData.upi_id),
  );

  let walletRef;
  let workerRef;
  let txRef;
  let updatedBalance = 0;
  let requestedAmount = amount;
  let providerReferenceId = null;

  try {
    if (amount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    if (!isValidUpiId(upiId)) {
      return res.status(400).json({ error: 'Enter a valid UPI ID' });
    }

    if (!isLivePayoutMode()) {
      return await simulateWithdrawal(req, res, { amount, upiId });
    }

    if (!isRazorpayXConfigured()) {
      return res.status(503).json({
        error: 'RazorpayX is not configured on the backend. Add RazorpayX keys, account number and allowlist this server IP before retrying.',
      });
    }

    const db = getDb();
    walletRef = db.collection('wallets').doc(req.uid);
    workerRef = db.collection('workers').doc(req.uid);
    txRef = walletRef.collection('transactions').doc();
    providerReferenceId = txRef.id;
    const idempotencyKey = generateIdempotencyKey();

    let workerData = {};

    await db.runTransaction(async (tx) => {
      const [walletDoc, workerDoc] = await Promise.all([
        tx.get(walletRef),
        tx.get(workerRef),
      ]);

      const wallet = walletDoc.exists ? (walletDoc.data() || {}) : {};
      workerData = workerDoc.exists ? (workerDoc.data() || {}) : (req.workerData || {});
      const currentBalance = toWholeRupees(wallet.balance);

      if (amount > currentBalance) {
        const err = new Error('Insufficient balance for withdrawal');
        err.code = 'INSUFFICIENT_BALANCE';
        throw err;
      }

      if (!workerData.name || !workerData.phone) {
        const err = new Error('Complete your rider profile before withdrawing to UPI');
        err.code = 'MISSING_RIDER_PROFILE';
        throw err;
      }

      updatedBalance = currentBalance - amount;

      tx.set(walletRef, {
        balance: updatedBalance,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      tx.set(workerRef, {
        upi_id: upiId,
        ...(req.userEmail && !workerData.email ? { email: req.userEmail } : {}),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      tx.set(txRef, {
        type: 'withdrawal',
        amount: -amount,
        requested_amount: amount,
        refunded_amount: 0,
        status: 'initiated',
        description: buildWithdrawalDescription(upiId),
        provider: 'razorpayx',
        provider_status: 'initiated',
        provider_reference_id: providerReferenceId,
        provider_idempotency_key: idempotencyKey,
        worker_id: req.uid,
        upi_id: upiId,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    const destination = await ensureRazorpayDestination({
      workerRef,
      workerId: req.uid,
      worker: {
        ...workerData,
        upi_id: upiId,
        email: workerData.email || req.userEmail,
      },
      upiId,
      fallbackEmail: req.userEmail,
    });

    const payout = await createPayoutToVpa({
      amountPaise: amount * 100,
      fundAccountId: destination.fundAccountId,
      referenceId: providerReferenceId,
      idempotencyKey,
      narration: `ShiftSure ${providerReferenceId.slice(0, 8)}`,
      notes: {
        worker_uid: String(req.uid),
        wallet_tx_id: String(providerReferenceId),
        upi_id: upiId,
      },
    });

    const mappedStatus = mapPayoutStatusToWalletStatus(payout.status);

    await txRef.set({
      status: mappedStatus,
      provider_status: String(payout.status || '').toLowerCase(),
      provider_payout_id: payout.id || null,
      provider_contact_id: destination.contactId,
      provider_fund_account_id: destination.fundAccountId,
      status_details: payout.status_details || null,
      utr: payout.utr || null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return res.json({
      success: true,
      pending: mappedStatus !== 'processed',
      status: mappedStatus,
      amount_withdrawn: amount,
      balance: updatedBalance,
      provider: 'razorpayx',
      reference_id: providerReferenceId,
      provider_payout_id: payout.id || null,
      status_details: payout.status_details || null,
      message: mappedStatus === 'processed'
        ? `Withdrawal processed to ${upiId}`
        : `Withdrawal submitted to RazorpayX. Current status: ${mappedStatus}`,
    });
  } catch (err) {
    if (err.code === 'INSUFFICIENT_BALANCE' || err.code === 'MISSING_RIDER_PROFILE') {
      return res.status(400).json({ error: err.message });
    }

    if (err instanceof RazorpayXError && walletRef && txRef) {
      if (err.ambiguous && err.step === 'create_payout') {
        await txRef.set({
          status: 'pending',
          provider_status: 'confirmation_pending',
          failure_reason: err.message,
          status_details: buildFailureStatus(err.message, 'network', 'confirmation_pending'),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        return res.status(202).json({
          success: true,
          pending: true,
          status: 'pending',
          amount_withdrawn: requestedAmount,
          balance: updatedBalance,
          provider: 'razorpayx',
          reference_id: providerReferenceId,
          message: 'Withdrawal request is pending provider confirmation. Refresh the wallet after RazorpayX responds or after webhook delivery.',
        });
      }

      await markWithdrawalAsReleased({
        walletRef,
        txRef,
        requestedAmount,
        finalStatus: 'failed',
        providerStatus: err.step === 'create_payout' ? 'failed' : 'request_failed',
        failureReason: err.message,
        statusDetails: buildFailureStatus(
          err.message,
          (err.details && err.details.source) || 'razorpayx',
          (err.details && err.details.reason) || 'request_failed',
        ),
      });

      const statusCode = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? 400 : 502;
      return res.status(statusCode).json({ error: err.message });
    }

    if (walletRef && txRef) {
      await markWithdrawalAsReleased({
        walletRef,
        txRef,
        requestedAmount,
        finalStatus: 'failed',
        providerStatus: 'failed',
        failureReason: err.message,
        statusDetails: buildFailureStatus(err.message),
      });
    }

    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
