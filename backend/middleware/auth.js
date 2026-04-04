const { getAuth, getDb } = require('../config/firebase');

/**
 * Verifies Firebase ID token in Authorization header.
 * Attaches req.uid and req.role to the request.
 */
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.uid = decoded.uid;

    // Fetch role from Firestore worker doc
    const db = getDb();
    const workerDoc = await db.collection('workers').doc(decoded.uid).get();
    if (workerDoc.exists) {
      req.role = workerDoc.data().role || 'rider';
      req.workerData = workerDoc.data();
    } else {
      req.role = 'rider';
      req.workerData = null;
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token', detail: err.message });
  }
}

module.exports = authMiddleware;
