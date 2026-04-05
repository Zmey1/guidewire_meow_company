from pydantic import BaseModel
from typing import Optional


# ── Risk Score ──────────────────────────────────────────────────────────────

class RiskScoreRequest(BaseModel):
    zone_id: str
    rainfall_mm: float = 0.0
    flood_signal: bool = False
    severe_flood_signal: bool = False
    dispatch_outage: bool = False
    heat_index: float = 0.0
    aqi: float = 0.0
    zone_restriction: bool = False
    unsafe_signal: bool = False


class RiskBreakdown(BaseModel):
    rain: float
    flood: float
    dispatch: float
    heat_aqi: float
    restriction: float


class RiskScoreResponse(BaseModel):
    risk_score: float
    tier: str  # none / tier1 / tier2 / full
    expected_loss: float
    breakdown: RiskBreakdown


# ── Calculate Premium ────────────────────────────────────────────────────────

class PremiumRequest(BaseModel):
    zone_trigger_probability: float
    avg_daily_income_loss: float
    days_exposed: int = 7
    city_factor: float
    pool_surplus_rebate: float = 0.0


class PremiumResponse(BaseModel):
    base_risk_premium: float
    city_factor: float
    rebate: float
    final_premium: float


# ── Predict Income ───────────────────────────────────────────────────────────

class ShiftSlot(BaseModel):
    day: str          # mon / tue / wed / thu / fri / sat / sun
    start: str        # "HH:MM" 24h
    end: str          # "HH:MM" 24h


class PredictIncomeRequest(BaseModel):
    weekly_income_band: int   # rupees/week e.g. 12000
    tier: str                 # none / tier1 / tier2 / full
    weekly_hours: float = 40.0
    shift_slots: list[ShiftSlot]
    trigger_window_start: str   # ISO datetime string
    trigger_window_end: str     # ISO datetime string
    zone_density_factor: float = 1.0
    demand_factor: float = 1.0
    expected_loss: float = 0.0
    premium_pool: float = 0.0
    expected_claims: float = 0.0


class PredictIncomeResponse(BaseModel):
    eligible_hours: float
    income_loss: float
    scaled_payout: float
    coverage_ratio: float


# ── Fraud Check ──────────────────────────────────────────────────────────────

class FraudCheckRequest(BaseModel):
    worker_id: str
    zone_id: str
    trigger_event_id: str
    claim_id: str
    trigger_type: str
    peer_consensus_ratio: float
    payout_amount: float


class FraudResult(BaseModel):
    graph_anomaly_score: float
    ring_detected: str           # none / soft / hard
    trust_score_at_check: float
    decision_source: str         # matrix


class FraudCheckResponse(BaseModel):
    decision: str                # approved / rejected
    fraud_result: FraudResult
