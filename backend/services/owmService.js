const axios = require('axios');

const OWM_BASE = 'https://api.openweathermap.org/data/2.5';
const API_KEY = process.env.OWM_API_KEY;

/**
 * Fetch weather data for a lat/lng location.
 * Returns { rainfall_mm, heat_index, aqi }
 */
async function fetchWeather(lat, lng) {
  try {
    const [weatherRes, aqiRes] = await Promise.all([
      axios.get(`${OWM_BASE}/weather`, {
        params: { lat, lon: lng, appid: API_KEY, units: 'metric' },
        timeout: 5000,
      }),
      axios.get(`${OWM_BASE}/air_pollution`, {
        params: { lat, lon: lng, appid: API_KEY },
        timeout: 5000,
      }),
    ]);

    const weather = weatherRes.data;
    const rainfall_mm = weather.rain ? (weather.rain['1h'] || weather.rain['3h'] || 0) : 0;
    const temp = weather.main?.temp || 30;
    const humidity = weather.main?.humidity || 60;
    // Heat index approximation (Steadman formula simplified)
    const heat_index = temp + 0.33 * ((humidity / 100) * 6.105 * Math.exp((17.27 * temp) / (237.7 + temp))) - 4;

    // AQI from OWM uses European scale 1-5; convert to US AQI-like value for thresholds
    const aqiList = aqiRes.data?.list?.[0];
    const pm2_5 = aqiList?.components?.pm2_5 || 0;
    // Rough µg/m³ → AQI mapping
    const aqi = pm2_5LtoAQI(pm2_5);

    return { rainfall_mm, heat_index: Math.round(heat_index * 10) / 10, aqi: Math.round(aqi) };
  } catch (err) {
    console.error('[OWM] fetch failed:', err.message);
    // Return zeros — pipeline caller should handle gracefully
    return { rainfall_mm: 0, heat_index: 30, aqi: 0 };
  }
}

function pm2_5LtoAQI(pm) {
  // EPA breakpoints simplified
  if (pm <= 12) return linearScale(pm, 0, 12, 0, 50);
  if (pm <= 35.4) return linearScale(pm, 12.1, 35.4, 51, 100);
  if (pm <= 55.4) return linearScale(pm, 35.5, 55.4, 101, 150);
  if (pm <= 150.4) return linearScale(pm, 55.5, 150.4, 151, 200);
  if (pm <= 250.4) return linearScale(pm, 150.5, 250.4, 201, 300);
  if (pm <= 350.4) return linearScale(pm, 250.5, 350.4, 301, 400);
  return linearScale(pm, 350.5, 500.4, 401, 500);
}

function linearScale(val, cLow, cHigh, iLow, iHigh) {
  return ((iHigh - iLow) / (cHigh - cLow)) * (val - cLow) + iLow;
}

module.exports = { fetchWeather };
