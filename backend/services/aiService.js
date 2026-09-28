const axios = require('axios');

const AI_BASE = process.env.AI_SERVICE_URL || 'http://localhost:8001';

// Shared secret checked by the AI service (X-Internal-Token) so its public
// Cloud Run URL cannot be used to call /fraud-check and alter trust scores.
const client = axios.create({
  baseURL: AI_BASE,
  headers: process.env.AI_SERVICE_TOKEN ? { 'X-Internal-Token': process.env.AI_SERVICE_TOKEN } : {},
});

async function getRiskScore(payload) {
  const res = await client.post(`/risk-score`, payload, { timeout: 10000 });
  return res.data; // { risk_score, tier, expected_loss, breakdown }
}

async function calculatePremium(payload) {
  const res = await client.post(`/calculate-premium`, payload, { timeout: 10000 });
  return res.data; // { base_price, zone_addon, forecast_addon, rebate, final_premium }
}

async function predictIncome(payload) {
  const res = await client.post(`/predict-income`, payload, { timeout: 10000 });
  return res.data; // { eligible_hours, income_loss, coverage_ratio, scaled_payout }
}

async function fraudCheck(payload) {
  const res = await client.post(`/fraud-check`, payload, { timeout: 15000 });
  return res.data; // { decision, fraud_result }
}

module.exports = { getRiskScore, calculatePremium, predictIncome, fraudCheck };
