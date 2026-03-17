# ShiftSure

> **AI-Powered Parametric Income Protection for Grocery & Q-Commerce Delivery Partners**

[![Hackathon](https://img.shields.io/badge/Guidewire-DEVTrails%202026-orange)](https://github.com/Zmey1/guidewire_meow_company)
[![Phase](https://img.shields.io/badge/Phase-Seed%20%2F%20Phase%201-blue)]()
[![University](https://img.shields.io/badge/University-SRM%20IST-red)]()
[![Team](https://img.shields.io/badge/Team-Meow%20Company-purple)]()

---

## Team

| Field | Detail |
|---|---|
| **Hackathon** | Guidewire DEVTrails 2026 |
| **Phase** | Seed / Phase 1 — Ideation & Foundation |
| **Persona** | Grocery / Q-Commerce Delivery Partners |
| **Team Name** | Meow Company |
| **University** | SRM Institute of Science and Technology (SRM IST) |

## Links

| Resource | Link |
|---|---|
| GitHub Repository | [github.com/Zmey1/guidewire_meow_company](https://github.com/Zmey1/guidewire_meow_company) |
| 2-Minute Video | *(add link before submission)* |
| Figma Prototype | *(add link before submission)* |

---

## Problem Statement

India's grocery and q-commerce delivery partners (Zepto, Blinkit, Swiggy Instamart) work on hyperlocal, time-sensitive shifts and depend on weekly earnings for financial stability. A single disruption — heavy rain, zone flooding, a dark-store dispatch outage, extreme heat, or a sudden zone restriction — can wipe out hours of potential income in minutes.

Today, **no automated financial product exists** for this specific income loss. Riders bear the full cost of every disruption with no safety net.

**ShiftSure** is an AI-powered parametric income protection platform built for this gap. It covers riders against **loss of earnings caused by verified external disruptions**, using a weekly pricing model, automated trigger detection, and instant payouts — no manual claims, no paperwork, no waiting.

---

## Why Q-Commerce

We chose grocery and q-commerce delivery (Zepto, Blinkit, Swiggy Instamart) because this segment is uniquely suited to parametric insurance:

- Deliveries run on narrow 10–20 minute SLAs — peak-hour windows drive the majority of weekly income
- Dark-store dispatch can pause abruptly, leaving riders idle mid-shift with no recourse
- Hyperlocal rain or flooding blocks pickups and drop-offs within minutes
- Income loss is **directly tied to measurable, verifiable real-world events** — exactly what parametric insurance is designed for
- No equivalent protection product exists for this cohort today

---

## Platform Choice — Mobile App

ShiftSure is a **React Native (Expo) mobile application**, not a web app. This is a deliberate product decision:

- Q-commerce riders operate entirely through partner mobile apps (Zepto Partner, Blinkit Rider, Swiggy Delivery). A native app fits their existing workflow — they will not open a browser mid-shift.
- **Push notifications** are non-negotiable. When a disruption triggers a payout, the rider must receive an instant alert. Native FCM push is reliable; web push on Android is not.
- **Background GPS** (with consent) enables zone-presence fraud validation — confirming the rider was actually in the affected zone during the disruption window. This requires native device access.
- **Offline-first caching** matters because riders frequently operate in low-connectivity areas (basement dark-store zones, dense urban pockets). The app caches policy status and wallet balance locally and syncs on reconnect.
- React Native + Expo delivers both Android and iOS from a single codebase, keeping build speed on par with a web approach.

The **admin / insurer dashboard** is a separate React web app (Vite + Tailwind) — admins work on desktops and need wide-screen layouts for analytics, loss ratio tracking, and claims queues.

---

## Coverage Scope

ShiftSure covers **loss of income only**. Coverage applies when a verified parametric disruption overlaps with the rider's declared active shift in their zone.

**Included**
- Lost delivery earnings due to a verified disruption event
- Missed shift hours caused by weather or dark-store (platform-side) outages
- Income loss during an active declared shift that overlaps a confirmed trigger in the rider's zone

**Excluded** — health insurance, accident insurance, life insurance, vehicle repair costs, medical reimbursements.

---

## User Persona

**Ravi**, 24, q-commerce delivery rider, dense urban zone, **evening shifts 5 PM – 11 PM**, primary income from dark-store delivery volume.

| Pain Point | Detail |
|---|---|
| Heavy rain | Reduces orders, blocks roads, waterlogging prevents pickups |
| Extreme heat / AQI | Unsafe outdoor conditions, reduced order volume |
| Dark-store dispatch pauses | Leaves him idle mid-shift with no orders dispatched |
| Zone restrictions | Sudden curfews or closures cut off his operating area |
| No safety net | No recourse for hours he was ready to work but could not earn |

### Core Scenario

Ravi buys a ShiftSure Standard plan (Rs. 59/week) before his work week. He declares his shift as 5 PM – 11 PM in the Koramangala zone. On Wednesday evening, heavy rain begins and the dark store pauses dispatch entirely.

**ShiftSure detects:**
- Rain >= 25 mm/hr in his zone (Tier 2 trigger)
- Flood/waterlogging signal active
- Dispatch outage for his assigned dark store
- Shift overlap confirmed: his 17:00–23:00 declared slot overlaps the trigger window

**Result:** The platform automatically computes a composite risk score (84 — Full payout tier), estimates his protected shift income (Rs. 420), applies a 1.0 payout multiplier, and credits Rs. 420 to his UPI wallet. No action required from Ravi.

---

## Parametric Triggers

All five triggers require the disruption window to overlap with the rider's declared active shift in the affected zone.

### Trigger 1 — Heavy Rain

| Level | Threshold | Payout |
|---|---|---|
| Tier 1 | >= 15 mm/hr | 40% of eligible shift income |
| Tier 2 | >= 25 mm/hr | 80% of eligible shift income |

*Source: OpenWeatherMap API (free tier)*

### Trigger 2 — Flood / Waterlogging

| Level | Condition | Payout |
|---|---|---|
| Tier 1 | `flood_signal = true` for rider's zone | 50% of eligible shift income |
| Tier 2 | `severe_flood_signal = true` | 100% of eligible shift income |

*Source: IMD alerts API or mock flood feed (boolean per zone)*

### Trigger 3 — Dark-Store / Platform Outage

| Condition | Payout |
|---|---|
| `dispatch_outage = true` for rider's assigned `dark_store_id` during declared shift | 70% of eligible shift income |

*Source: Mock dark-store dispatch feed (seeded per `dark_store_id`)*

### Trigger 4 — Zone Restriction / Closure

| Condition | Payout |
|---|---|
| Admin-flagged curfew, police restriction, or market closure in active zone | 100% of eligible shift income |

*Source: Manual admin flag (MVP)*

### Trigger 5 — Extreme Heat / Hazardous AQI

| Level | Threshold | Payout |
|---|---|---|
| Tier 1 (Heat) | Heat index >= 42°C | 40% of eligible shift income |
| Tier 2 (Heat) | Heat index >= 47°C | 80% of eligible shift income |
| Tier 1 (AQI) | AQI >= 300 (Hazardous) | 50% of eligible shift income |
| Tier 2 (AQI) | AQI >= 400 (Severe) | 80% of eligible shift income |

*Source: OpenWeatherMap free tier (temperature/heat index + Air Pollution API — same key)*

### Composite Risk Score

```
risk_score = (0.30 × rain_score)
           + (0.20 × flood_score)
           + (0.20 × dispatch_score)
           + (0.15 × heat_aqi_score)
           + (0.15 × restriction_score)

rain_score        = min(100, rainfall_mm × 4)
flood_score       = 60 if flood_signal; 100 if severe_flood_signal; else 0
dispatch_score    = 80 if dispatch_outage for rider's dark_store_id; else 0
heat_aqi_score    = min(100, max(heat_index_score, aqi_score))
                    heat_index_score: 0 if <42°C | 60 if ≥42°C | 100 if ≥47°C
                    aqi_score:        0 if <300   | 60 if ≥300  | 100 if ≥400
restriction_score = 80 if zone_restriction; else 0

Score  < 40  → no trigger
Score 40–59  → Tier 1 payout
Score 60–79  → Tier 2 payout
Score ≥ 80   → Full payout
```

---

## AI Layer

ShiftSure uses a deliberate **two-phase AI strategy**: a rule-based engine for Phase 1 (explainable, fast to build, easy to audit), upgraded to trained ML models in Phase 2 once historical disruption-income data is available. In parametric insurance, explainability is a product requirement — riders must understand their payout, and insurers must be able to audit every decision.

### 1. Risk Scoring

**Phase 1 (Rule-Based):** The weighted composite formula above, with static weights derived from domain research into which disruption types cause the greatest income loss for q-commerce riders.

**Phase 2 (ML):** Replace static weights with a **Ridge Regression model** trained on historical zone-disruption-income data. The model learns zone-specific risk patterns (e.g., Koramangala floods more often during evening shifts than Indiranagar). Ridge Regression preserves full interpretability — each feature gets a learned coefficient that can be inspected and audited.

### 2. Income Prediction

```
E(income) = base_hourly_rate × eligible_shift_hours
           × time_multiplier × day_type_factor × zone_density_factor

base_hourly_rate     = weekly_income_band / total declared weekly shift hours
eligible_shift_hours = overlap between rider's shift_slots and the trigger event window
time_multiplier      = 1.6 (evening peak 17:00–23:00) | 1.4 (lunch peak 12:00–14:00) | 1.0 (other)
day_type_factor      = 1.2 (weekend / holiday) | 1.0 (weekday)
zone_density_factor  = zone.base_orders_per_day / city_avg_orders_per_day
```

**Phase 2 (ML):** Gradient Boosted Regressor trained on historical rider earnings (synthetic in MVP, real via platform partnerships in production). Features include zone, shift timing, day of week, recent order volume trends, and seasonal patterns.

### 3. Payout Calculation

```
payout = E(income) × disruption_multiplier
payout = min(payout, policy.weekly_cap − payouts_already_issued_this_week)

disruption_multiplier:
  risk_score ≥ 80  → 1.0
  risk_score 60–79 → 0.7
  risk_score 40–59 → 0.4
  risk_score < 40  → 0.0
```

### 4. Predictive Risk Outlook

Every Sunday evening, ShiftSure generates a next-week risk outlook per zone using OpenWeatherMap's 5-day forecast API (free tier):

```
forecast_risk_score = weighted_average(
    forecast_rain_probability × rain_weight,
    forecast_temp_max         × heat_weight,
    forecast_aqi_trend        × aqi_weight,
    zone_historical_rate      × history_weight
)
```

**For riders:** A "Next Week Risk" card during policy purchase — e.g., *"Your zone has HIGH disruption risk next week (monsoon forecast). We recommend the Plus plan."*

**For admin:** Estimated claim volume and payout liability for the coming week, enabling capital reserve planning.

**Phase 2 (ML):** Replace with a Prophet / ARIMA time-series model trained on historical disruption-claim correlations.

---

## Weekly Premium Model

ShiftSure uses a **weekly pricing model** that matches how gig workers earn. Premiums are dynamically adjusted each week based on predicted disruption risk — riders in safer zones pay less, riders in high-risk zones during monsoon weeks pay a fair risk-adjusted price.

### Plan Tiers

| Plan | Base Weekly Premium | Weekly Coverage Cap | Best For |
|---|---|---|---|
| **Lite** | Rs. 39 | Rs. 1,500 | Part-time riders, lower risk exposure |
| **Standard** | Rs. 59 | Rs. 2,500 | Average q-commerce rider |
| **Plus** | Rs. 89 | Rs. 4,000 | Full-time riders, high income dependency |

### Dynamic Premium Formula

```
Weekly Premium = Base Plan Price
              + Zone Risk Add-on
              + Forecast Risk Add-on
              − Reliability Discount

Zone Risk Add-on:
  < 2 disruptions/month historically  → Rs. 0
  2–4 disruptions/month               → Rs. 10
  > 4 disruptions/month               → Rs. 20

Forecast Risk Add-on:
  forecast_risk_score < 30   → Rs. 0
  forecast_risk_score 30–59  → Rs. 5
  forecast_risk_score 60–79  → Rs. 10
  forecast_risk_score ≥ 80   → Rs. 15

Reliability Discount:
  0 claims in last 4 weeks   → −Rs. 10
  0 claims in last 8 weeks   → −Rs. 15
```

### Actuarial Viability (Standard Plan, 1,000 Riders)

| Scenario | Claim Rate | Avg Payout | Total Claims | Pool | Loss Ratio |
|---|---|---|---|---|---|
| Normal week | 8% | Rs. 350 | Rs. 28,000 | Rs. 64,000 | 43.8% ✅ |
| Moderate week | 15% | Rs. 500 | Rs. 75,000 | Rs. 69,000 | 108.7% (offset by reserves) |
| Severe week | 25% | Rs. 700 | Rs. 175,000 | Rs. 74,000 | 236.5% (requires reinsurance) |

Annual blended loss ratio ~85–95%, viable for a microinsurance product with zero-agent, zero-manual-claims operations. B2B platform fee (Rs. 50–150/worker/month) provides additional margin.

---

## Fraud Detection

### Phase 1 — Rule-Based Scoring

| Rule | Signal | Score Impact |
|---|---|---|
| Duplicate payout | Same `worker_id` + `trigger_event_id` already paid | Reject immediately |
| Enrolment velocity | Enrolled < 2 hours before trigger in their zone | +60 |
| Earnings outlier | `weekly_income_band` > Rs. 14,000/week and unverified | +30 |
| Claim frequency | > 5 claims in the current week | +25 |
| Zone hopping | Changed zone > 2 times in past 7 days | +20 |

**Thresholds:** `fraud_score ≥ 70` → hold for manual review | `40–69` → auto-approve but flag | `< 40` → auto-approve

### Phase 2 — GPS / Location Validation

With rider consent, the app collects GPS pings every 5 minutes during declared shift hours. This enables zone-presence verification, GPS spoofing detection (impossible travel patterns, jitter analysis), and activity baseline fingerprinting per rider.

### Phase 3 — Historical Weather Cross-Referencing

Claims are retroactively verified against OpenWeatherMap historical data and IMD archival feeds. Riders who consistently claim at borderline trigger thresholds are flagged for pattern analysis.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **Mobile App (Rider)** | React Native + Expo | Single codebase for Android/iOS, FCM push, background GPS |
| **Admin Dashboard** | React + Vite + Tailwind CSS | Desktop-first, Recharts for visualisation |
| **Backend** | Node.js + Express | REST API, JWT authentication |
| **AI Service** | Python + FastAPI | Rule-based Phase 1; Ridge Regression / ML Phase 2 |
| **Database** | MongoDB Atlas | Free M0 tier (512 MB) |
| **Scheduler** | node-cron | Polls all disruption feeds every 15 minutes |
| **Mobile Deploy** | Expo EAS Build | OTA updates, free dev tier |
| **Admin Deploy** | Vercel | Free tier |
| **Backend Deploy** | Render | Free tier (Node.js + Python services) |
| **Weather / AQI** | OpenWeatherMap | Free tier — rainfall, temperature, heat index, AQI, 5-day forecast |
| **Flood Signal** | IMD alerts / mock | Boolean flag per zone |
| **Dark-Store Feed** | Mock service | Seeded `dispatch_outage` per `dark_store_id` |

---

## System Architecture

```
+---------------------------+     +--------------------------------+
|  React Native Mobile App  |     |  React Web Admin Dashboard     |
|  (Rider)                  |     |  (Insurer / Operations)        |
|  Onboarding | Policy      |     |  Analytics | Claims Review     |
|  Wallet | Risk Outlook    |     |  Loss Ratios | Predictions     |
+------------+--------------+     +---------------+----------------+
             |  REST                              |  REST
+------------v------------------------------------v----------------+
|                      Node.js / Express                          |
|   Auth | Policy | Claims | Wallet | Zones | Admin | Forecast    |
+-------+------------------------------------------+-------------+
        |  HTTP                        node-cron (every 15 min)
+-------v-----------+            +-----------------------------+
|  Python FastAPI    |            |  Trigger Engine             |
|  /risk-score       |            |  Fetch weather + flood + AQI|
|  /predict-income   |            |  Compute risk scores        |
|  /calculate-loss   |            |  Validate shift overlap     |
|  /forecast-risk    |            |  Issue payouts              |
+--------------------+            +-----------------------------+
+----------------------------------------------------------------+
|                      MongoDB Atlas                             |
|  workers | policies | claims | trigger_events | zones          |
|  forecast_snapshots | fraud_logs                               |
+----------------------------------------------------------------+
```

---

## Database Schema

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

### zones
```json
{
  "_id": "ObjectId",
  "name": "string",
  "city": "string",
  "lat": "number",
  "lon": "number",
  "base_orders_per_day": "number",
  "density_factor": "number",
  "dark_store_ids": ["ObjectId"]
}
```

Additional collections: `forecast_snapshots` (weekly risk outlook per zone), `fraud_logs` (audit trail).

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
| GET | `/api/ai/forecast-risk/:zoneId` | Next-week risk outlook for a zone |
| POST | `/api/ai/dynamic-premium` | Personalised weekly premium for rider + zone + forecast |
| POST | `/api/claims/trigger` | Manual claim trigger |
| GET | `/api/claims/history` | Worker's claim history |
| GET | `/api/wallet/:workerId` | Wallet balance + transaction history |
| GET | `/api/zones` | All zones with current risk scores |
| GET | `/api/zones/:id/risk` | Live risk for a specific zone |
| POST | `/api/gps/log` | Rider GPS pings during active shifts |
| GET | `/api/admin/analytics` | Portfolio overview, loss ratios, predictive claim volume |
| POST | `/internal/scheduler/run` | Internal cron endpoint — not publicly exposed |
| POST | `/api/admin/simulate-trigger` | Demo mode — fires a full trigger cycle |

### Demo Endpoint

```json
POST /api/admin/simulate-trigger

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
```

`trigger_type` accepts: `rain`, `flood`, `dispatch_outage`, `zone_restriction`, `heat`, `aqi`

---

## Demo Flow

A judge can verify the full end-to-end loop in under 5 minutes:

1. Open rider mobile dashboard — Ravi's active Standard plan, wallet Rs. 0, zone risk: Low
2. Open admin panel — click **Simulate Disruption Event**, set zone: Koramangala, `rain_mm = 28`, `flood_signal = true`
3. Composite risk score computes to **84** — Full payout tier triggered
4. Shift overlap validated — Ravi's 17:00–23:00 slot overlaps the trigger window
5. Expected income calculated — Rs. 420 for the affected shift window
6. Payout applied — Rs. 420 × 1.0 multiplier, within weekly_cap Rs. 2,500
7. Wallet updated in real time — Rs. 0 → Rs. 420
8. Claim record written — `status: settled`, `fraud_score: 8`, `settled_at: <timestamp>`

**Total time from button click to wallet credit: under 5 seconds.**

---

## Data & Assumptions

| Data | Status | Reason |
|---|---|---|
| Rainfall, temperature, heat index | Real (OpenWeatherMap API) | Free tier, 60 calls/min |
| Air Quality Index (AQI) | Real (OpenWeatherMap Air Pollution API) | Same API key, free tier |
| 5-day weather forecast | Real (OpenWeatherMap Forecast API) | Used for predictive risk outlook |
| Flood / waterlogging signal | Mocked (boolean per zone) | IMD API requires prior approval |
| Dark-store dispatch status | Mocked (seeded per `dark_store_id`) | No public Zepto/Blinkit/Swiggy APIs exist; mock uses identical interface, zero code change to swap in real data |
| Zone restriction events | Manual (admin flag) | No public real-time API exists |
| Rider earnings history | Synthetic (from `weekly_income_band`) | Delivery platform APIs unavailable |
| GPS location data | Simulated (mock trails per rider) | Real GPS requires physical device |

---

## Business Model

| Model | Description | Viability |
|---|---|---|
| **B2C Direct** | Riders pay Rs. 39–89/week through the app. Weekly billing matches their earning cycle. Rider owns their policy and receives payouts to their UPI wallet. | Primary — viable at 5,000+ riders/city with geographic risk diversification |
| **B2B Platform Partnership** | Zepto/Blinkit/Swiggy Instamart subsidise coverage as a rider welfare tool, paying Rs. 50–150/rider/month. Rider still controls their policy. | Distribution accelerator — reduces rider acquisition cost to near zero |
| **SaaS / Government Scheme** | License the trigger engine and AI models to existing insurers or state welfare schemes. | Future — precedent: PM-Fasal Bima Yojana uses the same parametric model for crop insurance |

---

## Project Structure

```
guidewire_meow_company/
├── mobile/                      # React Native + Expo (Rider App)
│   └── src/
│       ├── screens/             # Onboarding, Dashboard, Policy, Wallet, RiskOutlook
│       ├── components/
│       ├── services/            # API client, push notification handler, gpsLogger
│       └── store/               # Zustand state management
├── admin-dashboard/             # React + Vite + Tailwind (Insurer Web Dashboard)
│   └── src/
│       ├── pages/               # Overview, Claims, Zones, Fraud, Predictions
│       ├── components/
│       └── store/
├── backend/                     # Node.js + Express
│   ├── routes/                  # auth, policies, claims, wallet, zones, admin, forecast, gps
│   ├── models/                  # Mongoose schemas
│   ├── services/                # triggerEngine.js, scheduler.js, fraudChecker.js,
│   │                            #   forecastEngine.js, gpsLogger.js
│   └── scripts/
│       └── seed.js              # Demo data seeder
├── ai-service/                  # Python + FastAPI
│   ├── models/                  # risk_score.py, income_predict.py, loss_calc.py, forecast_risk.py
│   └── main.py
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- MongoDB Atlas account (free M0 tier)
- OpenWeatherMap API key (free at [openweathermap.org](https://openweathermap.org))

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
# Scan QR code with Expo Go, or press 'a' for Android emulator

# Admin Dashboard (Web)
cd ../admin-dashboard
npm install
npm run dev
# Opens at http://localhost:5173
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

Then open the admin panel at `http://localhost:5173/admin` and click **Simulate Disruption Event** to run the full demo loop.

---

## Roadmap

| Phase | Timeline | Deliverables |
|---|---|---|
| **Phase 1 — Seed** | Weeks 1–2 | README, persona scenarios, trigger definitions, premium model, tech stack. Basic auth API, OpenWeatherMap + AQI integration POC, Figma prototype. |
| **Phase 2 — Scale** | Weeks 3–4 | Onboarding flow, policy purchase with dynamic premium, trigger engine (all 5 triggers), auto-payout loop, income prediction, admin claims panel, Ridge Regression model on synthetic data. |
| **Phase 3 — Soar** | Weeks 5–6 | Advanced fraud detection (GPS validation, historical weather cross-referencing), predictive risk outlook, full rider dashboard, admin analytics with loss ratio tracking, Razorpay test mode, demo simulation mode, 5-min video, final pitch deck. |
| **V2 (post-hackathon)** | Future | Real GPS validation on physical devices, ML-driven continuous pricing, Razorpay live UPI, multi-city scaling, real platform partnership API integrations. |

---

## Non-Functional Targets

| Metric | Target |
|---|---|
| API response time | < 200ms |
| Page load | < 3 seconds |
| Payout latency (real-time) | < 60 seconds from trigger |
| Payout latency (demo mode) | < 5 seconds |
| MVP capacity | 1,000 concurrent riders |
| Test coverage | Unit tests on all core algorithm functions |

---

## License

MIT — Built for Guidewire DEVTrails 2026 by **Meow Company**, SRM IST.