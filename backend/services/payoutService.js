/**
 * payoutService.js
 * Single place where claim payouts credit a wallet. Used by:
 *   - verificationPipeline (rider-filed claims)
 *   - triggerEngine        (admin/cron-triggered auto payouts)
 *   - POST /api/admin/claims/:id/override
 *
 * Every credit runs in ONE Firestore transaction: claim status transition,
 * weekly-cap check, policy counter, wallet balance, ledger entry and pool
 * totals commit together or not at all. The ledger entry has a deterministic
 * id (`payout_<claimId>`) and is written with create(), so retries, concurrent
 * claims and repeated admin overrides cannot pay a claim twice or push a
 * policy past its weekly cap. Missing wallets are created.
 *
 * Payouts here are simulated wallet credits only — no payment provider is
 * called, and nothing external may ever be called inside the transaction.
 */

const admin = require('firebase-admin');

function toWholeRupees(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}

function payoutTxId(claimId) {
  return `payout_${claimId}`;
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} opts
 * @param {FirebaseFirestore.DocumentReference} opts.claimRef
 * @param {string} opts.workerId
 * @param {string} [opts.policyId]
 * @param {string} [opts.poolId]
 * @param {number} opts.payoutAmount        requested (pre-cap) amount in rupees
 * @param {object|function} [opts.claimFields]  extra claim fields, or fn(finalAmount) => fields
 * @param {string} opts.description         ledger entry description
 * @param {object} [opts.txFields]          extra ledger entry fields
 * @param {string[]} [opts.allowedStatuses] existing claim must be in one of these
 * @param {boolean} [opts.enforceCap=true]  clamp to the policy's remaining weekly cap
 * @returns {Promise<{credited: boolean, amount: number, reason?: string, status?: string}>}
 */
async function creditClaimPayout(db, {
  claimRef,
  workerId,
  policyId,
  poolId,
  payoutAmount,
  claimFields = {},
  description,
  txFields = {},
  allowedStatuses = null,
  enforceCap = true,
}) {
  const walletRef = db.collection('wallets').doc(workerId);
  const ledgerRef = walletRef.collection('transactions').doc(payoutTxId(claimRef.id));
  const policyRef = policyId ? db.collection('policies').doc(policyId) : null;

  return db.runTransaction(async (tx) => {
    const [claimDoc, ledgerDoc, policyDoc] = await Promise.all([
      tx.get(claimRef),
      tx.get(ledgerRef),
      policyRef ? tx.get(policyRef) : Promise.resolve(null),
    ]);

    const claim = claimDoc.exists ? (claimDoc.data() || {}) : null;

    if (ledgerDoc.exists || (claim && claim.status === 'approved')) {
      return {
        credited: false,
        reason: 'already_paid',
        amount: toWholeRupees(ledgerDoc.exists ? ledgerDoc.data().amount : claim.payout_amount),
      };
    }

    if (allowedStatuses && (!claim || !allowedStatuses.includes(claim.status))) {
      return { credited: false, reason: 'invalid_status', amount: 0, status: claim ? claim.status : null };
    }

    let amount = Math.max(0, toWholeRupees(payoutAmount));
    if (enforceCap && policyDoc && policyDoc.exists) {
      const policy = policyDoc.data() || {};
      const cap = toWholeRupees(policy.effective_weekly_cap || policy.weekly_cap || 0);
      const remaining = cap - toWholeRupees(policy.payouts_issued_this_week || 0);
      amount = Math.max(0, Math.min(amount, remaining));
    }

    if (amount <= 0) {
      return { credited: false, reason: 'cap_reached', amount: 0 };
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const extraClaimFields = typeof claimFields === 'function' ? claimFields(amount) : claimFields;

    tx.set(claimRef, {
      ...extraClaimFields,
      status: 'approved',
      payout_amount: amount,
      rejection_reason: null,
      resolved_at: now,
    }, { merge: true });

    if (policyDoc && policyDoc.exists) {
      tx.update(policyRef, {
        payouts_issued_this_week: admin.firestore.FieldValue.increment(amount),
      });
    }

    // set+merge so a missing wallet doc is created instead of failing the payout
    tx.set(walletRef, {
      balance: admin.firestore.FieldValue.increment(amount),
      updated_at: now,
    }, { merge: true });

    tx.create(ledgerRef, {
      type: 'payout',
      amount,
      status: 'completed',
      provider: 'simulated',
      description,
      claim_id: claimRef.id,
      created_at: now,
      ...txFields,
    });

    if (poolId) {
      tx.set(db.collection('pools').doc(poolId), {
        total_claimed: admin.firestore.FieldValue.increment(amount),
        surplus: admin.firestore.FieldValue.increment(-amount),
      }, { merge: true });
    }

    return { credited: true, amount };
  });
}

module.exports = { creditClaimPayout, payoutTxId, toWholeRupees };
