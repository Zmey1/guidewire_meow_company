require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initFirebase } = require('./config/firebase');

// Init Firebase Admin SDK
initFirebase();

const app = express();
app.use(cors());
app.use(express.json());

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
