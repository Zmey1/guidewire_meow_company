const axios = require('axios');

const AI_BASE = process.env.AI_SERVICE_URL || 'http://localhost:8001';

async function getRiskScore(payload) {
  const res = await axios.post(`${AI_BASE}/risk-score`, payload, { timeout: 10000 });
  return res.data; // { risk_score, tier, expected_loss, breakdown }
}

async function calculatePremium(payload) {
  const res = await axios.post(`${AI_BASE}/calculate-premium`, payload, { timeout: 10000 });
  return res.data; // { base_price, zone_addon, forecast_addon, rebate, final_premium }
}

async function predictIncome(payload) {
  const res = await axios.post(`${AI_BASE}/predict-income`, payload, { timeout: 10000 });
  return res.data; // { eligible_hours, income_loss, coverage_ratio, scaled_payout }
}

async function fraudCheck(payload) {
  const res = await axios.post(`${AI_BASE}/fraud-check`, payload, { timeout: 15000 });
  return res.data; // { decision, fraud_result }
}

module.exports = { getRiskScore, calculatePremium, predictIncome, fraudCheck };
