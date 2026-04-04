"""
main.py — ShiftSure AI Service (FastAPI)
Swagger UI available at /docs after startup.

All endpoints are rule-based (ML-ready contracts, models slot in later).
"""

import logging
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
    Compute composite disruption risk score for a zone.
    Weights: rain 30% | flood 20% | dispatch 20% | heat_aqi 15% | restriction 15%
    """
    rain_score = min(100.0, req.rainfall_mm * 4.0)

    # Precedence: severe_flood > flood > 0
    if req.severe_flood_signal:
        flood_score = 100.0
    elif req.flood_signal:
        flood_score = 60.0
    else:
        flood_score = 0.0

    dispatch_score = 80.0 if req.dispatch_outage else 0.0

    heat_score = (
        100.0 if req.heat_index >= 47
        else 60.0 if req.heat_index >= 42
        else 0.0
    )
    aqi_score = (
        100.0 if req.aqi >= 400
        else 60.0 if req.aqi >= 300
        else 0.0
    )
    heat_aqi_score = min(100.0, max(heat_score, aqi_score))

    restriction_score = 80.0 if req.zone_restriction else 0.0

    risk_score_val = (
        0.30 * rain_score
        + 0.20 * flood_score
        + 0.20 * dispatch_score
        + 0.15 * heat_aqi_score
        + 0.15 * restriction_score
    )
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
        breakdown=RiskBreakdown(
            rain=round(rain_score, 2),
            flood=round(flood_score, 2),
            dispatch=round(dispatch_score, 2),
            heat_aqi=round(heat_aqi_score, 2),
            restriction=round(restriction_score, 2),
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
    Estimate disruption payout based on declared shifts and trigger window.
    """
    from datetime import datetime as dt

    disruption_mults = {"full": 1.0, "tier2": 0.7, "tier1": 0.4, "none": 0.0}
    if req.tier not in disruption_mults:
        raise HTTPException(status_code=400, detail=f"Invalid tier '{req.tier}'.")

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

    if total_declared <= 0:
        return PredictIncomeResponse(
            eligible_hours=0.0, estimated_income=0.0, payout_amount=0.0
        )

    base_hourly = req.weekly_income_band / total_declared

    # Time-of-day multiplier based on trigger window start hour
    hour = tw_start.hour
    if 17 <= hour <= 23:
        time_mult = 1.6
    elif 12 <= hour <= 14:
        time_mult = 1.4
    else:
        time_mult = 1.0

    # Weekend factor
    day_type = 1.2 if tw_start.weekday() >= 5 else 1.0

    estimated_income = round(
        base_hourly * eligible_hours * time_mult * day_type * req.zone_density_factor, 2
    )
    disruption_mult = disruption_mults[req.tier]
    payout = round(estimated_income * disruption_mult, 2)

    return PredictIncomeResponse(
        eligible_hours=round(eligible_hours, 3),
        estimated_income=estimated_income,
        payout_amount=payout,
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
        # If Neo4j is unavailable (e.g. no credentials set), fail open with reduced trust
        raise HTTPException(status_code=503, detail=f"Graph service unavailable: {e}")

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
