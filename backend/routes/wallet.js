const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getDb } = require('../config/firebase');

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

    const transactions = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    return res.json({ balance: walletData.balance || 0, transactions });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
