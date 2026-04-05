const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getDb } = require('../config/firebase');
const { getRiskScore } = require('../services/aiService');
const { fetchWeather } = require('../services/owmService');

// GET /api/zones/risk — compute on-demand risk for rider's zone
router.get('/risk', auth, async (req, res) => {
  try {
    const db = getDb();
    const worker = req.workerData;
    if (!worker || !worker.zone_id) {
      return res.status(404).json({ error: 'Worker zone not found' });
    }

    const zoneDoc = await db.collection('zones').doc(worker.zone_id).get();
    if (!zoneDoc.exists) return res.status(404).json({ error: 'Zone not found' });
    const zone = { id: zoneDoc.id, ...zoneDoc.data() };

    // Fetch dark store for dispatch signal
    const dsDoc = await db.collection('dark_stores').doc(worker.dark_store_id).get();
    const darkStore = dsDoc.exists ? dsDoc.data() : {};

    // Live weather
    const { rainfall_mm, heat_index, aqi } = await fetchWeather(zone.lat, zone.lng);

    const payload = {
      zone_id: zone.id,
      rainfall_mm,
      heat_index,
      aqi,
      flood_signal: zone.flood_signal || false,
      severe_flood_signal: zone.severe_flood_signal || false,
      dispatch_outage: darkStore.dispatch_outage || false,
      zone_restriction: zone.zone_restriction || false,
      unsafe_signal: zone.unsafe_signal || false,
    };

    const result = await getRiskScore(payload);

    // Persist current_risk_score to zone doc
    await db.collection('zones').doc(zone.id).update({
      current_risk_score: result.risk_score,
    });

    return res.json({
      zone_id: zone.id,
      zone_name: zone.name,
      ...result,
      signals: {
        rainfall_mm,
        heat_index,
        aqi,
        flood_signal: zone.flood_signal || false,
        severe_flood_signal: zone.severe_flood_signal || false,
        dispatch_outage: darkStore.dispatch_outage || false,
        zone_restriction: zone.zone_restriction || false,
        unsafe_signal: zone.unsafe_signal || false,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
