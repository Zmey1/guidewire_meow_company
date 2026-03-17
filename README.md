# ShiftSure

> **AI-Powered Weekly Income Protection for Grocery / Q-Commerce Delivery Partners**

[![Hackathon](https://img.shields.io/badge/Guidewire-DEVTrails%202026-orange)](https://github.com/Zmey1/guidewire_meow_company)
[![Phase](https://img.shields.io/badge/Phase-Seed%20%2F%20Phase%201-blue)]()
[![University](https://img.shields.io/badge/University-SRM%20IST-red)]()

---

## Team Details

| Field | Detail |
|---|---|
| **Hackathon** | Guidewire DEVTrails 2026 |
| **Phase** | Seed / Phase 1 — Ideation & Foundation |
| **Persona** | Grocery / Q-Commerce Delivery Partners |
| **Team Name** | Meow Company |
| **University** | SRM IST |

## Demo Links

| Resource | Link |
|---|---|
| GitHub Repository | [github.com/Zmey1/guidewire_meow_company](https://github.com/Zmey1/guidewire_meow_company) |
| 2-Minute Video | *(add link)* |
| Prototype / Figma | *(add link)* |

---

## Problem Statement

India's grocery and q-commerce delivery partners work on highly time-sensitive shifts and depend on weekly earnings for financial stability. Even short disruptions — heavy rain, flooding, dark-store outages, or sudden zone restrictions — can reduce their working hours and directly cut their income.

Today, there is **no simple, automated financial protection product** built specifically for this kind of income loss.

**ShiftSure** is an AI-powered, parametric income protection platform for grocery and q-commerce riders. It protects workers against **loss of income caused by external disruptions**, using a weekly pricing model, automated trigger detection, and instant claim initiation — with no manual claims, no paperwork, and no waiting.

---

## Why Grocery / Q-Commerce

We selected this persona because this segment is especially vulnerable to hyperlocal disruptions that are straightforward to verify and model.

- Deliveries are extremely time-sensitive — narrow peak-hour windows drive most weekly income
- Dark-store operations can halt suddenly, leaving riders idle mid-shift
- Hyperlocal rain or flooding can block pickups and drop-offs within minutes
- Loss of income is directly tied to measurable, verifiable real-world events
- This makes q-commerce a near-perfect fit for **parametric insurance** — claims triggered by predefined events, not manual verification

---

## Platform Choice — Mobile App

ShiftSure is built as a **mobile application** using React Native (Expo), not a web app. This is a deliberate choice driven by our persona's behaviour:

- Q-commerce riders already operate entirely through mobile apps (Zepto Partner, Blinkit Rider, Swiggy Delivery). A native-feeling app fits their existing workflow — they will not open a browser mid-shift.
- **Push notifications** are critical for our product. When a disruption is detected and a claim is auto-initiated, the rider needs an instant notification ("Heavy rain detected in your zone — Rs. 420 payout initiated"). Web push is unreliable on Android; native push via FCM is not.
- **Background location access** (with rider consent) enables GPS-based fraud validation — confirming the rider was actually in the affected zone during the disruption window. This is not possible with a web app.
- **Offline-first architecture** matters because riders often operate in low-connectivity pockets (basement dark-store areas, dense urban zones). The app caches policy status and wallet balance locally and syncs when connectivity returns.
- React Native with Expo lets us ship to both Android and iOS from a single codebase, keeping development speed on par with a web build while delivering a native experience.

For the **admin/insurer dashboard**, we use a separate React web app — admins operate on desktops and need wide-screen layouts for analytics, loss ratios, and claim review queues.

---

## Coverage Scope

ShiftSure covers **loss of income only**. The product is intentionally scoped to lost wages and lost working hours caused by external disruptions.

During onboarding, each rider declares their preferred shift slots. Coverage applies only when a verified disruption overlaps with those declared active shift hours.

### Included

- Lost delivery earnings due to a verified parametric disruption event
- Missed work hours caused by weather or platform-side (dark-store) outages
- Income loss during an active declared shift that overlaps with a confirmed trigger event in the rider's zone

### Excluded

- Health insurance
- Accident insurance
- Life insurance
- Vehicle repair costs
- Medical reimbursements

---

## User Persona

**Ravi**, 24, is a q-commerce delivery rider operating in a dense urban zone. He works evening shifts from **5 PM to 11 PM** and depends on consistent daily delivery volume from nearby dark stores.

### Pain Points

| Pain Point | Detail |
|---|---|
| Heavy rain | Reduces orders, blocks roads |
| Extreme heat | Unsafe to ride, reduced order volume during heatwaves |
| Dark-store dispatch pauses | Leaves him idle mid-shift |
| Local waterlogging | Prevents pickups and drop-offs |
| Zone restrictions | Cuts off his operating area |
| Severe air pollution | Hazardous AQI makes outdoor delivery unsafe |
| No safety net | No recourse for hours he was ready to work but could not earn |

---

## Core Scenario

Ravi buys a weekly ShiftSure Standard plan (Rs. 49) before his work week. During onboarding he declared his shift as 5 PM to 11 PM in the Koramangala zone.

**Wednesday evening:**

1. Heavy rain begins in his operating zone
2. Roads near the assigned dark store become waterlogged
3. Store dispatch slows and then pauses entirely
4. Ravi's declared active shift (5 PM to 11 PM) overlaps with the disruption window

**ShiftSure detects:**

- Zone-level rain severity (>= 25 mm/hr, Tier 2)
- Flood / waterlogging signal from feed
- Rider-zone match confirmed
- Shift overlap validated against declared slots
- Dispatch interruption flag from dark-store feed

**Result:** The platform automatically initiates a claim, estimates protected lost shift hours, calculates the payout, and simulates a credit to Ravi's registered UPI account — without any action from Ravi.

---

## Solution Overview

ShiftSure is built around six core modules:

| Module | Function |
|---|---|
| **1. Smart Onboarding** | Rider registers with zone, shift slots, dark-store cluster, UPI ID |
| **2. AI Risk Profiling** | Composite risk score computed per zone and shift window |
| **3. Weekly Policy Creation** | 7-day plan recommended and purchased based on risk profile |
| **4. Parametric Trigger Monitoring** | Scheduler polls live/mock disruption feeds every 15 minutes |
| **5. Automatic Claims and Payout** | Trigger + shift overlap validated, claim initiated, wallet credited |
| **6. Fraud Detection and Validation** | Rule-based scoring prevents duplicate claims and gaming |

---

## Product Workflow

```
Rider Onboarding (declares zone, shift slots, income band, UPI ID)
      |
      v
Risk Profile Computed (zone + shift + dark-store reliability)
      |
      v
Weekly Plan Recommended  -->  Rider Purchases 7-Day Policy
      |
      v
Trigger Monitoring Runs Every 15 Minutes
      |
      v
Disruption Detected in Rider's Zone?
      |
      +-- NO  -->  Monitoring continues, no action
      |
      +-- YES
            |
            v
      Shift Overlap Validated (declared slots vs trigger window)
            |
            +-- NO MATCH  -->  No claim, monitoring continues
            |
            +-- MATCH
                  |
                  v
            Expected Shift Income Estimated (AI model)
                  |
                  v
            Payout Calculated (disruption_multiplier x eligible hours x hourly rate)
                  |
                  v
            Fraud Score Computed  -->  Auto-approve / Hold / Reject
                  |
                  v
            Payout Credited to UPI Wallet, Dashboard Updated
```

---

## Parametric Triggers

All triggers require the trigger window to overlap with the rider's declared active shift in the affected zone.

### Trigger 1 — Heavy Rain

| Level | Threshold | Payout |
|---|---|---|
| Tier 1 | >= 15 mm/hr in rider's zone | 40% of eligible shift income |
| Tier 2 | >= 25 mm/hr in rider's zone | 80% of eligible shift income |

*Source: OpenWeatherMap API (free tier, 60 calls/min)*

### Trigger 2 — Flood / Waterlogging

| Level | Condition | Payout |
|---|---|---|
| Tier 1 | `flood_signal = true` for rider's zone | 50% of eligible shift income |
| Tier 2 | `severe_flood_signal = true` | 100% of eligible shift income |

*Source: IMD alerts API or mock flood feed (boolean flag per zone)*

### Trigger 3 — Dark-Store / Platform Outage

| Condition | Payout |
|---|---|
| `dispatch_outage = true` for rider's assigned `dark_store_id` during declared shift | 70% of eligible shift income |

*Source: Mock dark-store dispatch feed (simulated per dark_store_id)*

### Trigger 4 — Zone Restriction / Closure

| Condition | Payout |
|---|---|
| Admin-flagged curfew, police restriction, or market closure in active zone | 100% of eligible shift income |

*Source: Admin panel flag (manual entry for MVP)*

### Trigger 5 — Extreme Heat / Hazardous AQI

| Level | Threshold | Payout |
|---|---|---|
| Tier 1 (Heat) | Heat index >= 42°C in rider's zone | 40% of eligible shift income |
| Tier 2 (Heat) | Heat index >= 47°C in rider's zone | 80% of eligible shift income |
| Tier 1 (AQI) | AQI >= 300 (Hazardous) in rider's zone | 50% of eligible shift income |
| Tier 2 (AQI) | AQI >= 400 (Severe) in rider's zone | 80% of eligible shift income |

*Source: OpenWeatherMap API — both temperature/heat index and Air Pollution API are available on the free tier*

### Composite Risk Score

```
risk_score = (0.30 x rain_score)
           + (0.20 x flood_score)
           + (0.20 x dispatch_score)
           + (0.15 x heat_aqi_score)
           + (0.15 x restriction_score)

rain_score        = min(100, rainfall_mm x 4)
flood_score       = 60 if flood_signal else 0; 100 if severe_flood_signal
dispatch_score    = 80 if dispatch_outage for rider's dark_store_id else 0
heat_aqi_score    = min(100, max(heat_index_score, aqi_score))
                    heat_index_score = 0 if < 42°C; 60 if >= 42°C; 100 if >= 47°C
                    aqi_score        = 0 if < 300; 60 if >= 300; 100 if >= 400
restriction_score = 80 if zone_restriction else 0

Score < 40   --> no trigger
Score 40-59  --> Tier 1 payout
Score 60-79  --> Tier 2 payout
Score >= 80  --> Full payout
```

---

## AI Layer

ShiftSure's AI strategy follows a **two-phase approach**: an explainable rule-based engine for Phase 1 (fast to build, fully transparent, easy to debug), upgraded to trained ML models in Phase 2 once we have sufficient historical disruption-income data to learn from.

This is a deliberate architectural choice. In parametric insurance, explainability matters — a rider should be able to understand why they received a specific payout amount, and an insurer should be able to audit every decision. We start with deterministic rules that serve as both the production engine and the training-data-generation layer for the ML models that replace them.

### 1. Risk Scoring — Rule-Based Baseline (Phase 1)

Inputs: live rainfall, flood signal, dispatch outage flag, zone restriction flag, heat index, AQI, historical disruption frequency per zone, shift timing exposure.

Output: `risk_score` (0–100) used to determine trigger tier and payout multiplier.

Phase 1 uses the weighted composite formula defined in the Parametric Triggers section above, with static weights assigned based on domain research into which disruption types cause the greatest income loss for q-commerce riders.

**Phase 2 ML Upgrade:** Replace static weights with a **Ridge Regression model** trained on historical zone-disruption-income data. The model learns zone-specific risk patterns — for example, that Koramangala floods more frequently during evening shifts than Indiranagar, or that HSR Layout sees more dark-store outages during monsoon months. The Ridge Regression output replaces the hand-tuned composite score while remaining fully interpretable (each feature gets a learned coefficient that can be inspected).

### 2. Income Prediction

```
E(income) = base_hourly_rate x eligible_shift_hours
           x time_multiplier x day_type_factor x zone_density_factor

base_hourly_rate     = declared_weekly_income_band / total declared weekly shift hours
eligible_shift_hours = overlap between rider's shift_slots and the trigger event window
time_multiplier      = 1.6 for evening peak (17:00-23:00)
                       1.4 for lunch peak (12:00-14:00)
                       1.0 otherwise
day_type_factor      = 1.2 (weekend / holiday), 1.0 (weekday)
zone_density_factor  = zone.base_orders_per_day / city_avg_orders_per_day
```

This gives a **protected shift income** estimate — what the rider would likely have earned under normal conditions.

**Phase 2 ML Upgrade:** Train a Gradient Boosted Regressor on historical rider-earnings data (synthetic in MVP, real via platform partnerships in production) to predict expected income with higher accuracy. Features include zone, shift timing, day of week, recent order volume trends, and seasonal patterns.

### 3. Payout Calculation

```
payout = E(income) x disruption_multiplier
payout = min(payout, policy.weekly_cap - payouts_already_issued_this_week)

disruption_multiplier:
  risk_score >= 80  -->  1.0   (full eligible income)
  risk_score 60-79  -->  0.7
  risk_score 40-59  -->  0.4
  risk_score < 40   -->  0.0   (no payout)
```

### 4. Predictive Risk Outlook (Next-Week Forecast)

ShiftSure does not only react to disruptions — it **predicts them**. Using OpenWeatherMap's 5-day weather forecast API (available on the free tier), the platform generates a **next-week risk outlook** for each zone every Sunday evening before riders purchase their weekly policy.

```
forecast_risk_score = weighted_average(
    forecast_rain_probability x rain_weight,
    forecast_temp_max x heat_weight,
    forecast_aqi_trend x aqi_weight,
    zone_historical_disruption_rate x history_weight
)
```

**For riders:** The app shows a "Next Week Risk" card during policy purchase — e.g., "Your zone has a HIGH disruption risk next week (monsoon forecast). We recommend the Plus plan for maximum coverage." This helps riders make informed coverage decisions and increases plan upgrade conversions.

**For the admin/insurer dashboard:** Predictive analytics show estimated claim volume and payout liability for the coming week across all zones. This enables reserve planning — the insurer can see "We expect ~Rs. 45,000 in claims next week across Bangalore zones due to forecast heavy rain" and ensure the capital pool is adequate.

**Phase 2 ML Upgrade:** Replace the weighted-average forecast with a time-series model (Prophet or ARIMA) trained on historical disruption-claim correlations, enabling more accurate week-ahead claim volume predictions.

---

## Weekly Premium Model

Gig workers think in short earning cycles. ShiftSure uses a **weekly pricing model** with three tiers. Unlike static insurance products, the weekly premium is **dynamically adjusted** each week based on the predicted disruption risk for the rider's zone — riders in safer zones during calm-weather weeks pay less, while riders in high-risk zones during monsoon weeks pay a fair risk-adjusted price.

### Plan Tiers

| Plan | Base Weekly Premium | Weekly Coverage Cap | Best For |
|---|---|---|---|
| **Lite** | Rs. 29 | Rs. 1,500 | Lower weekly risk exposure |
| **Standard** | Rs. 49 | Rs. 2,500 | Average q-commerce rider |
| **Plus** | Rs. 79 | Rs. 4,000 | High dependency on delivery income |

### Dynamic Premium Formula

```
Weekly Premium = Base Plan Price
              + Zone Risk Add-on (from historical data)
              + Forecast Risk Add-on (from next-week weather prediction)
              - Reliability Discount (from claims behaviour)

Zone Risk Add-on (Phase 1 — rule-based):
    Low risk zone (< 2 disruptions/month historically)   -->  Rs. 0
    Medium risk zone (2-4 disruptions/month)              -->  Rs. 10
    High risk zone (> 4 disruptions/month)                -->  Rs. 20

Forecast Risk Add-on (driven by predictive risk outlook):
    forecast_risk_score < 30    -->  Rs. 0   (calm week ahead)
    forecast_risk_score 30-59   -->  Rs. 5
    forecast_risk_score 60-79   -->  Rs. 10
    forecast_risk_score >= 80   -->  Rs. 15  (high-disruption week ahead)

Reliability Discount:
    0 claims in last 4 weeks    -->  -Rs. 10
    0 claims in last 8 weeks    -->  -Rs. 15 (loyalty bonus)
```

**Phase 2 ML Upgrade:** Replace the static add-on tiers with a **continuous ML-driven pricing model**. A trained regression model takes as input the zone's historical disruption frequency, the 5-day weather forecast, seasonal patterns, rider-specific claim history, and time-of-year factors, and outputs a personalized premium for each rider-zone-week combination. This enables true actuarial pricing — for example, the model might learn that Zone A has 3x the flood risk of Zone B during July, and price accordingly, rather than using a coarse Low/Medium/High bucket.

**Why this matters for viability:** Dynamic pricing directly controls the loss ratio. During high-risk weeks, higher premiums increase the capital pool to cover the expected surge in claims. During low-risk weeks, lower premiums keep the product affordable and prevent rider churn.

### Actuarial Viability Check (Back-of-Envelope)

To validate that the premium model is financially sustainable:

```
Assumptions:
  1,000 riders on Standard plan
  Average dynamic premium: Rs. 52/week (Rs. 49 base + average add-ons)
  Weekly premium pool: Rs. 52,000

Claim scenarios (per week):
  Normal week:  8% of riders claim, avg payout Rs. 350  -->  Rs. 28,000 in claims
  Moderate week: 15% of riders claim, avg payout Rs. 500 -->  Rs. 75,000 in claims
  Severe week:  25% of riders claim, avg payout Rs. 700  -->  Rs. 175,000 in claims

Loss ratios:
  Normal week:   28,000 / 52,000 = 53.8%  (healthy — target range)
  Moderate week: 75,000 / 58,500* = 128%  (exceeds pool — offset by reserves from normal weeks)
  Severe week:   175,000 / 67,000* = 261% (catastrophic — requires reinsurance or reserve fund)

  * Dynamic pricing raises the pool during high-risk weeks (forecast add-on kicks in)
```

At a portfolio level across 52 weeks, if ~35 weeks are normal, ~12 moderate, and ~5 severe, the annual loss ratio is approximately 85-95% — tight but viable for a microinsurance product where operating costs are near-zero (no agents, no manual claims). The B2B platform partnership fee (Rs. 50-150/worker/month from the q-commerce platform) provides additional margin that brings the combined loss ratio well below 70%.

This back-of-envelope validates that ShiftSure's pricing is in the right ballpark. Phase 2 will calibrate with real historical weather data for Bangalore zones.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **Mobile App (Rider)** | React Native + Expo | Native Android/iOS from single codebase, push notifications via FCM, background GPS |
| **Admin Dashboard (Web)** | React + Vite + Tailwind CSS | Desktop-first for insurer analytics, Recharts for data visualisation |
| **Backend** | Node.js + Express | REST API, JWT auth |
| **AI Service** | Python + FastAPI | Rule-based baseline (Phase 1) + Ridge Regression / ML models (Phase 2) |
| **Database** | MongoDB Atlas | Free M0 tier, 512 MB |
| **Scheduler** | node-cron | Polls weather + flood + AQI feeds every 15 minutes |
| **Mobile Deploy** | Expo EAS Build | OTA updates, free tier for development builds |
| **Admin Deploy** | Vercel | Free tier |
| **Backend Deploy** | Render | Free tier, Node.js + Python services |
| **Weather API** | OpenWeatherMap | Free, 60 calls/min — provides rainfall, temperature, heat index, and AQI |
| **Flood Signal** | IMD alerts / mock feed | Boolean flag per zone |
| **Dark-Store Feed** | Mock service | Seeded dispatch_outage per dark_store_id |

---

## System Architecture

```
+---------------------------+   +-------------------------------+
| React Native Mobile App   |   |  React Web Admin Dashboard    |
| (Rider)                   |   |  (Insurer / Operations)       |
| Onboarding | Policy |     |   |  Analytics | Claims Review |  |
| Wallet | Risk Outlook      |   |  Loss Ratios | Predictions   |
+------------+--------------+   +---------------+---------------+
             |  REST                            |  REST
+------------v------------------------------+---v--------------+
|                   Node.js / Express                          |
|    Auth | Policy | Claims | Wallet | Zones | Admin | Forecast|
+------+------------------------------------+---------+--------+
       |  HTTP                             |  node-cron (every 15 min)
+------v-----------+           +-----------v------------------+
|  Python FastAPI   |           |     Trigger Engine           |
|  /risk-score      |           |  Fetch weather + flood + AQI |
|  /predict-income  |           |  Compute risk scores         |
|  /calculate-loss  |           |  Validate shift overlap      |
|  /forecast-risk   |           |  Issue payouts               |
+-------------------+           +------------------------------+
+--------------------------------------------------------------+
|                     MongoDB Atlas                            |
|  workers | policies | claims | trigger_events | zones        |
|  forecast_snapshots | fraud_logs                             |
+--------------------------------------------------------------+
```

---

## Database Schema (Key Collections)

### workers

```json
{
  "_id": "ObjectId",
  "name": "string",
  "phone": "string",
  "zone_id": "ObjectId",
  "platform": "blinkit | zepto | swiggy",
  "dark_store_id": "ObjectId",
  "shift_slots": [{ "day": "string", "start_hour": 17, "end_hour": 23 }],
  "weekly_income_band": "number",
  "upi_id": "string",
  "wallet_balance": "number",
  "kyc_verified": "boolean",
  "claims_this_week": "number",
  "createdAt": "Date"
}
```

### policies

```json
{
  "_id": "ObjectId",
  "worker_id": "ObjectId",
  "plan": "lite | standard | plus",
  "weekly_premium": "number",
  "weekly_cap": "number",
  "status": "active | expired | cancelled",
  "valid_from": "Date",
  "valid_to": "Date",
  "createdAt": "Date"
}
```

### trigger_events

```json
{
  "_id": "ObjectId",
  "zone_id": "ObjectId",
  "timestamp": "Date",
  "risk_score": "number",
  "conditions": {
    "rain_mm": "number",
    "flood_signal": "boolean",
    "dispatch_outage": "boolean",
    "zone_restriction": "boolean",
    "heat_index_c": "number",
    "aqi": "number"
  },
  "payouts_issued": "number",
  "total_paid_inr": "number"
}
```

### claims

```json
{
  "_id": "ObjectId",
  "worker_id": "ObjectId",
  "policy_id": "ObjectId",
  "trigger_event_id": "ObjectId",
  "expected_income": "number",
  "payout_amount": "number",
  "fraud_score": "number",
  "status": "settled | held_for_review | rejected",
  "createdAt": "Date",
  "settled_at": "Date"
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Rider registration |
| POST | `/api/auth/login` | JWT login |
| GET | `/api/policies` | List active policies |
| POST | `/api/policies` | Purchase a plan (premium dynamically calculated) |
| POST | `/api/ai/risk-score` | Compute zone risk score |
| POST | `/api/ai/predict-income` | Estimate shift income |
| POST | `/api/ai/calculate-loss` | Compute payout amount |
| GET | `/api/ai/forecast-risk/:zoneId` | Get next-week risk outlook for a zone |
| POST | `/api/ai/dynamic-premium` | Calculate personalised weekly premium for rider + zone + forecast |
| POST | `/api/claims/trigger` | Manual claim trigger |
| GET | `/api/claims/history` | Worker's claim history |
| GET | `/api/wallet/:workerId` | Wallet balance + history |
| GET | `/api/zones` | List all zones with current risk scores |
| GET | `/api/zones/:id/risk` | Live risk for a specific zone |
| POST | `/api/gps/log` | Rider app posts GPS pings during active shifts |
| GET | `/api/admin/analytics` | Portfolio overview, loss ratios, predictive claim volume |
| POST | `/internal/scheduler/run` | Internal cron endpoint — not publicly exposed |
| POST | `/api/admin/simulate-trigger` | Demo mode — fires a full trigger cycle |

### Demo Endpoint

```json
POST /api/admin/simulate-trigger

Request body:
{
  "zone_id": "64abc...",
  "trigger_type": "rain",
  "rain_mm": 28,
  "flood_signal": true,
  "dispatch_outage": false,
  "zone_restriction": false,
  "heat_index_c": 38,
  "aqi": 150
}

Response:
{
  "payouts_issued": 43,
  "total_paid_inr": 18200,
  "trigger_event_id": "64def..."
}
```

`trigger_type` accepts one of: `rain`, `flood`, `dispatch_outage`, `zone_restriction`, `heat`, `aqi`

---

## Fraud Detection

ShiftSure uses a **layered fraud detection system** that combines rule-based scoring (Phase 1) with location validation and historical cross-referencing (Phase 2+). In parametric insurance, fraud takes specific forms — riders gaming enrollment timing, spoofing their location, or exploiting trigger thresholds. Our fraud engine is designed around these delivery-specific attack vectors.

### Phase 1 — Rule-Based Fraud Scoring

| Rule | Signal | Score Impact |
|---|---|---|
| **Duplicate payout** | Same `worker_id` + `trigger_event_id` already paid | Reject immediately |
| **Enrolment velocity** | Worker enrolled less than 2 hours before trigger in their zone | +60 |
| **Earnings outlier** | Declared `weekly_income_band` above Rs. 14,000/week and unverified | +30 |
| **Claim frequency** | More than 5 claims in the current week | +25 |
| **Zone hopping** | Worker changed zone more than twice in the past 7 days | +20 |

### Phase 2 — Location and Activity Validation

With rider consent, the mobile app collects GPS pings during declared shift hours (battery-efficient, every 5 minutes). This enables:

- **Zone presence verification:** Before approving a claim, the system checks whether the rider's GPS trail places them inside the affected zone during the disruption window. If a rider claims income loss due to heavy rain in Koramangala but their GPS shows they were in Whitefield (a dry zone), the claim is flagged.
- **GPS spoofing detection:** Cross-reference GPS coordinates with cell tower triangulation data and check for impossible travel patterns (e.g., jumping 15 km in 2 minutes). Known GPS spoofing apps produce characteristic jitter patterns that can be detected.
- **Activity baseline:** Over time, build a rider-specific activity fingerprint — typical zones, shift hours, movement patterns. Claims that deviate sharply from this baseline receive a higher fraud score.

### Phase 3 — Historical Weather Cross-Referencing

- **Fake weather claims:** When a claim is triggered by rain, the system retroactively verifies the reported rainfall against multiple weather data sources (OpenWeatherMap historical endpoint, IMD archival data). If the trigger engine recorded 28 mm/hr but historical verification shows only 8 mm/hr (possible API glitch or data feed manipulation), the claim is held for review.
- **Pattern analysis:** Flag riders who consistently claim during borderline trigger events (e.g., rain at exactly 15.1 mm/hr every time) — this statistical improbability suggests potential system gaming.

### Decision Thresholds

- `fraud_score >= 70` — hold payout, queue for manual review in admin panel
- `fraud_score 40–69` — auto-approve but flag in admin panel for audit trail
- `fraud_score < 40` — auto-approve, no flags

---

## Analytics Dashboard

ShiftSure provides two distinct dashboard experiences tailored to each user role.

### Rider Dashboard (Mobile App)

The rider sees a focused, glanceable view designed for quick checks between deliveries:

- **Active Coverage Card** — current plan (Lite/Standard/Plus), valid until date, remaining weekly cap after any payouts this week
- **Earnings Protected This Week** — total payout amount received from claims this week, with a breakdown by trigger event
- **Next Week Risk Outlook** — predicted disruption risk for the rider's zone based on weather forecasts and historical patterns, with a plan upgrade recommendation if risk is high
- **Claim History** — timeline of past claims with status (settled / held / rejected), payout amount, and the trigger event that caused each one
- **Wallet Balance** — current balance with transaction history showing credits (payouts) and debits (premium payments)
- **Zone Risk Heatmap** — visual map showing current disruption risk levels across nearby zones

### Admin / Insurer Dashboard (Web)

The admin dashboard is built for operational oversight and financial planning:

- **Portfolio Overview** — total active policies, total riders covered, premiums collected this week, payouts issued this week
- **Loss Ratio Tracker** — real-time loss ratio (total payouts / total premiums) for the current week, current month, and trailing 4 weeks. A loss ratio above 100% is flagged in red.
- **Claims Queue** — list of all claims with fraud scores, filterable by status (settled / held_for_review / rejected). Held claims have a one-click approve/reject action.
- **Trigger Event Log** — chronological log of all detected disruption events with risk scores, affected zones, and total payouts issued per event
- **Zone Risk Heatmap** — city-wide view of current and forecast risk levels per zone, colour-coded by composite risk score
- **Predictive Analytics Panel** — estimated claim volume and payout liability for the coming week based on weather forecasts, displayed per zone and in aggregate. This enables capital reserve planning.
- **Fraud Analytics** — distribution of fraud scores across claims, flagged patterns (enrollment velocity spikes, zone-hopping clusters), and GPS anomaly alerts

---

## Demo Flow

A judge can verify the full end-to-end loop in under 5 minutes:

1. Open the worker dashboard — Ravi's active Standard plan is shown, wallet balance Rs. 0, zone risk: Low
2. Open the admin panel — click **Simulate Disruption Event**, set zone to Koramangala, `rain_mm = 28`, `flood_signal = true`
3. The composite risk score computes to 84 — Full payout tier triggered
4. Shift overlap validated — Ravi's 17:00–23:00 slot overlaps the trigger window
5. Expected income calculated — Rs. 420 for the affected shift window
6. Payout applied — Rs. 420 x 1.0 disruption multiplier, within weekly_cap of Rs. 2,500
7. Wallet updated in real time — Rs. 0 to Rs. 420
8. Claim record written — status: settled, fraud_score: 8, settled_at: timestamp

Total time from button click to wallet credit: under 5 seconds.

---

## Data and Assumptions

ShiftSure is a prototype. The table below is transparent about what is real versus simulated.

| Data | Status | Reason |
|---|---|---|
| Rainfall data | Real (OpenWeatherMap API) | Free tier, 60 calls/min |
| Temperature / Heat index | Real (OpenWeatherMap API) | Included in free tier weather endpoint |
| Air Quality Index (AQI) | Real (OpenWeatherMap Air Pollution API) | Free tier, same API key |
| 5-day weather forecast | Real (OpenWeatherMap Forecast API) | Free tier, used for predictive risk outlook |
| Flood / waterlogging signal | Mocked (boolean flag per zone) | IMD API requires prior approval; mock is functionally equivalent for demo |
| Dark-store dispatch status | Mocked (seeded per dark_store_id) | Zepto, Blinkit, and Swiggy Instamart have no public dispatch APIs. In production, platform partnerships would provide real dispatch feeds via API — our mock service uses the identical interface and data shape, so swapping in real data requires zero code changes. |
| Zone restriction events | Manual (admin panel flag) | No public API exists for real-time access restrictions |
| Rider earnings history | Synthetic (seeded from declared income band at signup) | Delivery platform APIs unavailable; weekly income band used as baseline |
| GPS location data | Simulated (mock GPS trail per rider) | Requires physical device for real GPS; mock trails used for fraud detection demo |

---

## Business Model

ShiftSure is a **rider-first product**. The primary experience is a delivery partner paying Rs. 29–79/week for income protection — simple, direct, and accessible. The platform partnership model scales distribution but does not replace the rider's agency in choosing and managing their own coverage.

| Model | Description | Viability |
|---|---|---|
| **B2C Direct Subscription** | Riders pay Rs. 29–79/week directly through the app. Weekly billing matches their earning cycle. The rider owns their policy, chooses their plan, and receives payouts to their UPI wallet. | Primary — this is the core product. Viable at 5,000+ riders per city with geographic risk diversification across zones. |
| **B2B Platform Partnership** | Quick-commerce platforms (Zepto, Blinkit, Swiggy Instamart) subsidise or co-fund coverage as a rider welfare and retention tool, paying Rs. 50–150 per rider per month. The rider still controls their policy; the platform covers part or all of the premium. | Distribution accelerator — viable immediately with one platform partner. Reduces rider acquisition cost to near-zero. |
| **SaaS / Government Scheme** | License the trigger engine and AI models to existing insurers or state welfare schemes targeting gig workers. | Future — precedent: PM-Fasal Bima Yojana uses the same parametric model for crop insurance. |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- MongoDB Atlas account (free M0 tier)
- OpenWeatherMap API key (free at openweathermap.org)

### Installation

```bash
# Clone the repository
git clone https://github.com/Zmey1/guidewire_meow_company
cd guidewire_meow_company

# Backend
cd backend
npm install
cp .env.example .env
# Edit .env: fill in MONGO_URI, JWT_SECRET, WEATHER_API_KEY
npm run dev

# AI Service
cd ../ai-service
pip install -r requirements.txt --break-system-packages
uvicorn main:app --reload --port 8001

# Mobile App (Rider)
cd ../mobile
npm install
npx expo start
# Scan QR code with Expo Go app on your phone, or press 'a' for Android emulator

# Admin Dashboard (Web)
cd ../admin-dashboard
npm install
npm run dev
# Opens at http://localhost:5173 by default
```

### Environment Variables

```env
# backend/.env
MONGO_URI=mongodb+srv://...
JWT_SECRET=your_secret_here
WEATHER_API_KEY=your_openweathermap_key
FLOOD_API_KEY=mock

# ai-service/.env
MONGO_URI=mongodb+srv://...
```

Set `FLOOD_API_KEY=mock` to use the built-in mock flood feed. Replace with a real IMD API token if available.

### Seed Demo Data

```bash
cd backend
npm run seed
# Creates 5 zones, 50 synthetic riders, 3 dark stores, and 30 days of historical trigger events
```

After seeding, open the admin panel at `http://localhost:5173/admin` (default Vite port — adjust if your setup uses a different port) and click **Simulate Disruption Event** to run the full demo loop.

---

## Project Structure

```
guidewire_meow_company/
├── mobile/                     # React Native + Expo (Rider App)
│   └── src/
│       ├── screens/            # Onboarding, Dashboard, Policy, Wallet, RiskOutlook
│       ├── components/
│       ├── services/           # API client, push notification handler
│       └── store/              # Zustand state management
├── admin-dashboard/            # React + Vite + Tailwind (Insurer Web Dashboard)
│   └── src/
│       ├── pages/              # Overview, Claims, Zones, Fraud, Predictions
│       ├── components/
│       └── store/
├── backend/                    # Node.js + Express
│   ├── routes/                 # auth, policies, claims, wallet, zones, admin, forecast
│   ├── models/                 # Mongoose schemas
│   ├── services/               # triggerEngine.js, scheduler.js, fraudChecker.js, forecastEngine.js
│   └── scripts/
│       └── seed.js             # demo data seeder
├── ai-service/                 # Python + FastAPI
│   ├── models/                 # risk_score.py, income_predict.py, loss_calc.py, forecast_risk.py
│   └── main.py
└── README.md
```

---

## Roadmap

| Phase | Timeline | Deliverables |
|---|---|---|
| **Phase 1 — Seed** | Weeks 1–2 | README with full strategy, persona scenarios, parametric trigger definitions, premium model, tech stack decision. Basic auth API, OpenWeatherMap + AQI integration proof-of-concept, Figma prototype of rider app. |
| **Phase 2 — Scale** | Weeks 3–4 | Rider registration and onboarding flow, policy purchase with dynamic premium calculation, trigger engine (rain + flood + heat/AQI + dispatch + zone restriction), auto-payout loop, income prediction model, admin panel with claims management. Ridge Regression model trained on synthetic historical data replaces static risk score weights. |
| **Phase 3 — Soar** | Weeks 5–6 | Advanced fraud detection (GPS validation, historical weather cross-referencing), predictive risk outlook (next-week forecast), rider dashboard with full wallet and claim history, admin dashboard with loss ratio tracking and predictive analytics, mock UPI payout integration (Razorpay test mode), demo simulation mode, 5-minute demo video, final pitch deck. |
| **V2 (post-hackathon)** | Future | Real GPS activity validation on physical devices, ML-driven continuous premium pricing, Razorpay live UPI integration, multi-city scaling, real platform partnership API integrations. |

---

## Non-Functional Targets

| Metric | Target |
|---|---|
| API response time | < 200ms |
| Page load | < 3 seconds |
| Payout latency (real-time) | < 60 seconds from trigger firing |
| Payout latency (demo mode) | < 5 seconds |
| MVP user capacity | 1,000 concurrent riders |
| Test coverage | Unit tests for all core algorithm functions |

---

## License

MIT — built for Guidewire DEVTrails 2026 by **Meow Company**, SRM IST.