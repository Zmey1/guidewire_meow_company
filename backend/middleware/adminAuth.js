const authMiddleware = require('./auth');

async function adminAuth(req, res, next) {
  await authMiddleware(req, res, () => {
    if (req.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

module.exports = adminAuth;
