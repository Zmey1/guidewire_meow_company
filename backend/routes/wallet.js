const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getDb } = require('../config/firebase');
const admin = require('firebase-admin');

function toWholeRupees(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}

// GET /api/wallet
router.get('/', auth, async (req, res) => {
  try {
    const db = getDb();
    const walletDoc = await db.collection('wallets').doc(req.uid).get();
    if (!walletDoc.exists) {
      return res.json({ balance: 0, transactions: [] });
    }

    const walletData = walletDoc.data();

    // Fetch transactions sub-collection
    const txSnap = await db.collection('wallets').doc(req.uid)
      .collection('transactions')
      .orderBy('created_at', 'desc')
      .limit(100)
      .get();

    const transactions = txSnap.docs.map(d => {
      const data = d.data() || {};
      return {
        id: d.id,
        ...data,
        amount: toWholeRupees(data.amount),
      };
    });

    return res.json({ balance: toWholeRupees(walletData.balance), transactions });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/wallet/withdraw
router.post('/withdraw', auth, async (req, res) => {
  try {
    const amount = toWholeRupees(req.body.amount);
    if (amount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    const db = getDb();
    const walletRef = db.collection('wallets').doc(req.uid);
    const txRef = walletRef.collection('transactions').doc();

    let updatedBalance = 0;
    await db.runTransaction(async (tx) => {
      const walletDoc = await tx.get(walletRef);
      const wallet = walletDoc.exists ? (walletDoc.data() || {}) : {};
      const currentBalance = toWholeRupees(wallet.balance);

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

      tx.set(txRef, {
        type: 'withdrawal',
        amount: -amount,
        status: 'completed',
        description: 'Wallet withdrawal',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return res.json({
      success: true,
      amount_withdrawn: amount,
      balance: updatedBalance,
    });
  } catch (err) {
    if (err.code === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
