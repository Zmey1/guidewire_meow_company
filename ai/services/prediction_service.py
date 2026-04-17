"""
Predictive Analysis Service
Calculates risk scores and predictions based on weather and zone data
"""


def calculate_predictions(forecast, zones):
    """
    Calculate risk predictions for each zone based on weather forecast
    
    Args:
        forecast: List of forecast items with date, rainfall_mm, heat_index, aqi
        zones: List of zones with zone_id, zone_name, historical_disruption_rate, avg_claims_per_trigger
        
    Returns:
        List of predictions with date, zone_id, risk_score, claims, and payout
    """

    results = []

    for day in forecast:
        for zone in zones:

            rain_score = min(100, day["rainfall_mm"] * 4)

            heat_score = 100 if day["heat_index"] > 42 else \
                         60 if day["heat_index"] > 38 else 0

            aqi_score = 100 if day["aqi"] > 300 else \
                        60 if day["aqi"] > 150 else 0

            heat_aqi = max(heat_score, aqi_score)

            risk_score = (0.30 * rain_score) + (0.15 * heat_aqi)

            risk_score = min(
                100,
                risk_score * (1 + zone["historical_disruption_rate"] * 0.5)
            )

            disruption_likely = risk_score >= 40

            base_riders = 30

            predicted_claims = round(
                (risk_score / 100)
                * base_riders
                * zone["historical_disruption_rate"]
            )

            predicted_payout = predicted_claims * zone["avg_claims_per_trigger"]

            results.append({
                "date": day["date"],
                "zone_id": zone["zone_id"],
                "zone_name": zone["zone_name"],
                "predicted_risk_score": round(risk_score, 1),
                "predicted_claims_count": predicted_claims,
                "predicted_payout_inr": round(predicted_payout, 2),
                "disruption_likely": disruption_likely
            })

    return results
