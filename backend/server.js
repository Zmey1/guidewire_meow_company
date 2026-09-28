require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initFirebase } = require('./config/firebase');

// Init Firebase Admin SDK
initFirebase();

const app = express();

// CORS only matters for the browser admin dashboard (the Android app sends no
// Origin). CORS_ALLOWED_ORIGINS is a comma-separated allowlist; when it is
// unset, local dev allows any origin and production allows none.
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && allowedOrigins.length === 0) {
  console.warn('[CORS] CORS_ALLOWED_ORIGINS is empty — browser clients will be blocked');
}
app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : !isProduction,
}));
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString();
  },
}));

// Routes
app.use('/api/workers', require('./routes/workers'));
app.use('/api/policies', require('./routes/policies'));
app.use('/api/claims', require('./routes/claims'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/zones', require('./routes/zones'));
app.use('/api/admin', require('./routes/admin'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'shiftsure-backend' }));

// 404
app.use((req, res) => res.status(404).json({ error: `Route ${req.path} not found` }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ShiftSure backend running on port ${PORT}`));
