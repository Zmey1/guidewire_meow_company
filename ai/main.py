"""
main.py — ShiftSure AI Service (FastAPI)
Swagger UI available at /docs after startup.

Risk and pricing are served by GLM-style actuarial logic with stable API contracts.
"""

import logging
import math
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import (
    RiskScoreRequest, RiskScoreResponse, RiskBreakdown,
    PremiumRequest, PremiumResponse,
    PredictIncomeRequest, PredictIncomeResponse,
    FraudCheckRequest, FraudCheckResponse, FraudResult,
)
import fraud as fraud_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# GLM-Tweedie coefficients (synthetic bootstrap calibration; refined as data grows)
GLM_COEFFICIENTS = {
    "beta0": -2.5,
    "beta1_rain": 0.8,
    "beta2_flood": 1.2,
    "beta3_dispatch": 0.9,
    "beta4_heat": 0.7,
    "beta5_restriction": 1.0,
    "beta6_unsafe": 0.85,
}

RISK_REFERENCE = 15.0


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("ShiftSure AI service starting...")
    yield
    fraud_service.close_driver()
    logger.info("ShiftSure AI service stopped.")


app = FastAPI(
    title="ShiftSure AI Service",
    description="Parametric income protection — risk scoring, premium calculation, income prediction, fraud detection.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ───────────────────────────────────────────────────────────────────

@app.get("/health", tags=["Meta"])
def health():
    return {"status": "ok", "service": "shiftsure-ai", "ts": datetime.now(timezone.utc).isoformat()}


# ── POST /risk-score ─────────────────────────────────────────────────────────

@app.post("/risk-score", response_model=RiskScoreResponse, tags=["Risk"])
def risk_score(req: RiskScoreRequest):
    """
    Compute expected loss with a GLM log-link and map to normalized risk tier.
    """
    flood_term = int(req.flood_signal) + 2 * int(req.severe_flood_signal)
    expected_loss = math.exp(
        GLM_COEFFICIENTS["beta0"]
        + GLM_COEFFICIENTS["beta1_rain"] * req.rainfall_mm
        + GLM_COEFFICIENTS["beta2_flood"] * flood_term
        + GLM_COEFFICIENTS["beta3_dispatch"] * int(req.dispatch_outage)
        + GLM_COEFFICIENTS["beta4_heat"] * (req.heat_index / 10.0)
        + GLM_COEFFICIENTS["beta5_restriction"] * int(req.zone_restriction)
        + GLM_COEFFICIENTS["beta6_unsafe"] * int(req.unsafe_signal)
    )

    risk_score_val = min(100.0, (expected_loss / RISK_REFERENCE) * 100.0)
    risk_score_val = round(risk_score_val, 2)

    tier = (
        "full" if risk_score_val >= 80
        else "tier2" if risk_score_val >= 60
        else "tier1" if risk_score_val >= 40
        else "none"
    )

    return RiskScoreResponse(
        risk_score=risk_score_val,
        tier=tier,
        expected_loss=round(expected_loss, 4),
        breakdown=RiskBreakdown(
            rain=round(req.rainfall_mm, 2),
            flood=round(float(flood_term), 2),
            dispatch=round(float(int(req.dispatch_outage)), 2),
            heat_aqi=round(max(req.heat_index, req.aqi), 2),
            restriction=round(float(int(req.zone_restriction)), 2),
        )
    )


# ── POST /calculate-premium ──────────────────────────────────────────────────

@app.post("/calculate-premium", response_model=PremiumResponse, tags=["Premium"])
def calculate_premium(req: PremiumRequest):
    """
    Dynamic actuarial premium calculation.
    Formula: clamp(prob * loss_per_day * exposed * city_factor, 20, 50) - rebate
    """
    base_risk_premium = req.zone_trigger_probability * req.avg_daily_income_loss * req.days_exposed
    adjusted = base_risk_premium * req.city_factor
    final = max(20.0, min(50.0, adjusted - req.pool_surplus_rebate))

    return PremiumResponse(
        base_risk_premium=round(base_risk_premium, 2),
        city_factor=float(req.city_factor),
        rebate=round(req.pool_surplus_rebate, 2),
        final_premium=round(final, 2),
    )


# ── POST /predict-income ─────────────────────────────────────────────────────

@app.post("/predict-income", response_model=PredictIncomeResponse, tags=["Income"])
def predict_income(req: PredictIncomeRequest):
    """
    Estimate claim-side income loss and pre-cap scaled payout.

    hourly_income = weekly_income_band / weekly_hours
    income_loss = hourly_income × eligible_hours × demand_factor
    coverage_ratio = 0.55 + 0.15 × S  where S uses zone risk + pool health
    scaled_payout = income_loss × coverage_ratio
    """
    from datetime import datetime as dt

    # Parse trigger window
    try:
        tw_start = dt.fromisoformat(req.trigger_window_start.replace("Z", "+00:00"))
        tw_end = dt.fromisoformat(req.trigger_window_end.replace("Z", "+00:00"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid datetime: {e}")

    # Compute total declared hours + eligible overlap hours
    total_declared = 0.0
    eligible_hours = 0.0

    # Day name → ISO weekday mapping
    day_map = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}

    for slot in req.shift_slots:
        day_idx = day_map.get(slot.day.lower())
        if day_idx is None:
            continue

        sh, sm = map(int, slot.start.split(":"))
        eh, em = map(int, slot.end.split(":"))
        slot_dur = (eh * 60 + em - sh * 60 - sm) / 60.0
        if slot_dur <= 0:
            continue
        total_declared += slot_dur

        # Build a concrete datetime for this slot in the trigger window's week
        # We anchor to the trigger_window_start date and walk to the right weekday
        anchor = tw_start.replace(hour=0, minute=0, second=0, microsecond=0)
        days_diff = (day_idx - anchor.weekday()) % 7
        slot_date = anchor.replace(tzinfo=None).date()
        from datetime import timedelta as td, date
        slot_date = (anchor + td(days=days_diff)).date()

        slot_start_dt = dt(slot_date.year, slot_date.month, slot_date.day, sh, sm,
                           tzinfo=tw_start.tzinfo)
        slot_end_dt = dt(slot_date.year, slot_date.month, slot_date.day, eh, em,
                         tzinfo=tw_start.tzinfo)

        # Overlap with trigger window
        overlap_start = max(slot_start_dt, tw_start)
        overlap_end = min(slot_end_dt, tw_end)
        if overlap_end > overlap_start:
            overlap_h = (overlap_end - overlap_start).total_seconds() / 3600.0
            eligible_hours += overlap_h

    # Coverage ratio components (§9A)
    R = max(0.0, min(1.0, req.expected_loss / RISK_REFERENCE))
    if req.premium_pool > 0 and req.expected_claims > 0:
        bcr = req.premium_pool / req.expected_claims
    else:
        bcr = 1.8
    P = max(0.0, min(1.0, (bcr - 1.0) / 1.8))
    S = 0.6 * (1.0 - R) + 0.4 * P
    coverage_ratio = max(0.55, min(0.70, 0.55 + 0.15 * S))

    if total_declared <= 0 or eligible_hours <= 0:
        return PredictIncomeResponse(
            eligible_hours=round(eligible_hours, 3),
            income_loss=0.0,
            scaled_payout=0.0,
            coverage_ratio=round(coverage_ratio, 4),
        )

    safe_weekly_hours = req.weekly_hours if req.weekly_hours and req.weekly_hours > 0 else 40.0
    safe_demand_factor = req.demand_factor if req.demand_factor > 0 else 1.0
    hourly_income = req.weekly_income_band / safe_weekly_hours
    income_loss = round(hourly_income * eligible_hours * safe_demand_factor, 2)
    scaled_payout = round(income_loss * coverage_ratio, 2)

    return PredictIncomeResponse(
        eligible_hours=round(eligible_hours, 3),
        income_loss=income_loss,
        scaled_payout=scaled_payout,
        coverage_ratio=round(coverage_ratio, 4),
    )


# ── POST /fraud-check ────────────────────────────────────────────────────────

@app.post("/fraud-check", response_model=FraudCheckResponse, tags=["Fraud"])
def fraud_check(req: FraudCheckRequest):
    """
    Dual-layer fraud detection:
      Layer 1 — Neo4j graph intelligence (PageRank heuristic + ring detection)
      Layer 2 — Deterministic decision matrix
    """
    try:
        result = fraud_service.run_fraud_check(
            worker_id=req.worker_id,
            zone_id=req.zone_id,
            trigger_event_id=req.trigger_event_id,
            claim_id=req.claim_id,
            payout_amount=req.payout_amount,
            peer_consensus_ratio=req.peer_consensus_ratio,
        )
    except RuntimeError as e:
        logger.error(f"Fraud check error: {e}")
        # If Neo4j is unavailable locally, fail open so claim verification can continue.
        result = {
            "decision": "approved",
            "fraud_result": {
                "graph_anomaly_score": 0.0,
                "ring_detected": "none",
                "trust_score_at_check": 0.5,
                "decision_source": "fallback_no_graph",
            },
        }

    fr = result["fraud_result"]
    return FraudCheckResponse(
        decision=result["decision"],
        fraud_result=FraudResult(
            graph_anomaly_score=fr["graph_anomaly_score"],
            ring_detected=fr["ring_detected"],
            trust_score_at_check=fr["trust_score_at_check"],
            decision_source=fr["decision_source"],
        )
    )
