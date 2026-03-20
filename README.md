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
| Figma Prototype | https://www.figma.com/make/FdffYpiBuhjjJhAixYDxBk/figma-prototype?p=f&t=5peWyRBPFzFzBOe8-0 |

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

---
## Platform Choice — Mobile App

ShiftSure is a **React Native (Expo) mobile application**, not a web app. This is a deliberate product decision:

- Q-commerce riders operate entirely through partner mobile apps (Zepto Partner, Blinkit Rider, Swiggy Delivery). A native app fits their existing workflow — they will not open a browser mid-shift.
- **Push notifications** are non-negotiable. When a disruption triggers a payout, the rider must receive an instant alert. Native FCM push is reliable; web push on Android is not.
- **Offline-first caching** matters because riders frequently operate in low-connectivity areas (basement dark-store zones, dense urban pockets). The app caches policy status, pool health, and wallet balance locally and syncs on reconnect.
- React Native + Expo delivers both Android and iOS from a single codebase, keeping build speed on par with a web approach.

The **admin / insurer dashboard** is a separate React web app (Vite + Tailwind) — admins work on desktops and need wide-screen layouts for analytics, pool monitoring, loss ratio tracking, and claims queues.

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

Ravi buys a ShiftSure Standard plan before his work week. His premium enters the mutual pool for his assigned dark store in the Koramangala zone. He declares his shift as 5 PM s– 11 PM.

On Wednesday evening, heavy rain begins and the dark store pauses dispatch entirely.

**ShiftSure detects:**
- **Peer consensus:** majority of insured riders at Ravi's dark store go idle within minutes → high consensus, event auto-validated
- **Weather corroboration:** rainfall crosses Tier 2 threshold in his zone
- Flood/waterlogging signal active
- Dispatch outage confirmed for his assigned dark store
- Shift overlap confirmed: his 17:00–23:00 declared slot overlaps the trigger window

**Result:**  
The platform computes a composite risk score (**Full payout tier**), estimates his protected shift income, applies the payout multiplier, and credits the payout to his UPI wallet, drawn from the dark-store pool. No action is required from Ravi.

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
### Graph Intelligence (InfDetect-Inspired)
---
ShiftSure extends traditional fraud detection using a **graph-based intelligence layer** that models relationships between entities instead of evaluating claims in isolation.

**Graph Model:**

Nodes:
- Worker
- Location (Zone)
- Weather Event
- Claim
- Device (GPS / Phone)

Edges:
- Worker → Location
- Worker → Claim
- Location → Weather Event
- Worker → Device

**What it detects:**
- Clustered claims in the same zone
- Mismatch between claims and real-world events
- Shared devices across multiple accounts
- Repeated or coordinated claim behavior

**Example:**
If multiple workers file claims in a zone with no rainfall, the graph detects an abnormal cluster and flags it as fraud.

**Output:**
- Graph-based fraud risk score
- Worker trust score (used in decision layer)

This approach is inspired by **InfDetect**, a large-scale graph-based fraud detection system used in insurance.


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
### 5. Graph Intelligence 

ShiftSure extends traditional fraud detection using a **graph-based intelligence layer** that models relationships between entities instead of evaluating claims in isolation.

**Graph Model:**

Nodes:
- Worker
- Location (Zone)
- Weather Event
- Claim
- Device (GPS / Phone)

Edges:
- Worker → Location
- Worker → Claim
- Location → Weather Event
- Worker → Device

**What it detects:**
- Clustered claims in the same zone
- Mismatch between claims and real-world events
- Shared devices across multiple accounts
- Repeated or coordinated claim behavior

**Example:**
If multiple workers file claims in a zone with no rainfall, the graph detects an abnormal cluster and flags it as fraud.

**Output:**
- Graph-based fraud risk score
- Worker trust score (used in decision layer)



**For riders:** A "Next Week Risk" card during policy purchase — e.g., *"Your zone has HIGH disruption risk next week (monsoon forecast). We recommend the Plus plan."*

**For admin:** Estimated claim volume and payout liability for the coming week, enabling capital reserve planning.

**Phase 2 (ML):** Replace with a Prophet / ARIMA time-series model trained on historical disruption-claim correlations.

---

## Weekly Premium Model — Mutual Micro-Pools

ShiftSure uses a **weekly pricing model** that matches how gig workers earn. But unlike traditional insurance where premiums disappear into a central corporate fund, ShiftSure uses a **mutual micro-pool model** at the dark-store level — inspired by Takaful and modern mutual InsurTech models like Lemonade's giveback.

Riders who work from the same dark store and face the same operating conditions are grouped into the same protection pool. Instead of treating every rider as an isolated policyholder, ShiftSure treats the dark-store cluster as a shared risk unit.

### How the Pool Works

Every dark store already has a fixed set of delivery partners assigned to it. These riders share the same operating zone, the same weather exposure, the same dispatch conditions, and similar disruption patterns. ShiftSure uses this existing assignment as a **natural pool boundary**.

When a rider purchases weekly coverage, their premium is split into three parts:
```text
Rider pays weekly premium
        │
        ├──▶ [Operating Fee]
        │    Goes to ShiftSure. Covers platform costs, technology,
        │    and operations. This is our revenue. Non-refundable.
        │
        ├──▶ [City Reserve]
        │    Shared reserve across all pools in the same city.
        │    Used when a single pool is overwhelmed during a severe
        │    week. Pools insuring each other — reinsurance at micro-scale.
        │
        └──▶ [Pool Risk Fund]
             Stays within this dark-store pool.
             All claims for pool members are paid from here.
             Whatever remains at end of week = surplus.
```

### The Surplus Mechanic

At the end of each week, the Pool Risk Fund either has money left or it doesn't.

**Low-claim week:** Few or no disruptions hit the zone. The Pool Risk Fund is largely intact. The remaining surplus is distributed back to every pool member as a **rebate on next week's premium**.

**Moderate week:** A disruption occurs but affects only part of the pool. Some claims are paid out. Whatever surplus remains (if any) is still distributed back — just a smaller rebate.

**Severe week:** A major zone-wide disruption hits. The Pool Risk Fund is exhausted. The City Reserve covers the overflow. No surplus this week — every member pays full premium next week.

**The Financial Incentive:** Riders have a direct financial stake in pool health. Because claim volume dictates surplus rebates, the incentive shifts from "maximizing claims" to "protecting the pool" for individual savings.

### Weekly Settlement

Surplus is calculated and distributed **once per week** when the new coverage period begins.

### Plan Tiers

| Plan | Coverage Level | Best For |
|---|---|---|
| **Lite** | Base coverage cap | Part-time riders, lower shift volume |
| **Standard** | Mid-range coverage cap | Typical q-commerce rider |
| **Plus** | Highest coverage cap | Full-time riders, high income dependency |

Base premium prices and exact coverage caps will be calibrated against real rider earning data and zone-level risk profiles during Phase 2.

### Dynamic Premium Formula
```text
Weekly Premium = Base Plan Price
              + Zone Risk Add-on       (historical disruption frequency for this dark store)
              + Forecast Risk Add-on   (predicted disruption risk for the coming week)
              − Surplus Rebate         (rider's share of previous week's pool surplus)
```

The surplus rebate is what makes this model fundamentally different from standard dynamic pricing. Riders don't just pay a calculated premium — they see money come *back* when their pool stays healthy. Over time, riders in consistently low-claim pools pay significantly less than the base price. Riders in high-claim pools pay closer to base — but still benefit in any week where claims come in lighter than expected.


---

## Fraud Detection (Hybrid AI + Graph Intelligence)
ShiftSure uses a **multi-layer fraud detection pipeline** combining rules, anomaly detection, machine learning, and graph intelligence.

### Fraud Pipeline

1. **Rule Engine**
   - Duplicate payouts
   - Suspicious enrolment timing
   - Zone hopping patterns

2. **Anomaly Detection**
   - Isolation Forest–style logic
   - Detects unusual claim frequency or behavior

3. **ML Classifier (Phase 2)**
   - Decision Tree / Random Forest
   - Classifies fraud vs genuine claims

4. **Graph Intelligence Layer**
   - Detects relationship-based fraud patterns
   - Identifies coordinated attacks and hidden connections

Final decision is based on a **combined fraud score + graph risk score**.

---

## Adversarial Defense & Anti-Spoofing Strategy

### The Attack Scenario

A sophisticated syndicate of 500 delivery workers in a tier-1 city coordinates via Telegram groups. They use GPS-spoofing applications to fake their locations, making it appear they are stranded in a severe red-alert weather zone while actually resting at home. They trigger mass false claims simultaneously, aiming to drain the liquidity pool.

ShiftSure's defense doesn't depend on detecting spoofed GPS. It operates on layers that make this attack structurally unviable.

---

### Why This Attack Fails Against ShiftSure

#### Defense 1 — Pool Fragmentation + Peer Consensus

The 500 attackers are not in one pool. They are spread across dozens of dark-store pools of 15–30 members each. Each pool is an isolated risk unit — draining one pool does not touch another.

Within any single pool, the attack collapses against peer consensus:
```text
Pool of 25 members, 10 are attackers:
- 10 attackers claim simultaneously (spoofing GPS)
- 15 legitimate riders are still actively delivering
  (the weather is fine — they're working normally)

Consensus ratio = 10/25 = 40%
→ Weather API cross-referenced: no red-alert in this zone
→ Corroboration FAILS → Claims flagged, not auto-approved
```

The system doesn't ask "is each rider's GPS valid?" — it asks "did the zone actually experience a disruption?" If 15 out of 25 riders are still delivering normally, the zone clearly isn't in crisis. The attackers are claiming a disruption that the majority of their own pool contradicts.

For the attack to succeed, the syndicate would need **>70% of every pool they're in** — requiring them to recruit the vast majority of riders at every dark store in the city. At that scale, it's no longer a hidden operation.

#### Defense 2 — Graph Intelligence Detects the Coordination

This is where InfDetect-inspired graph analysis catches what individual checks miss.

Normal city-wide disruption: high consensus within every affected pool. Riders within the same pool claim on the same events because they genuinely share the same conditions.

Syndicate attack: **low consensus within pools, but high correlation across pools.** 500 riders across 30+ pools all claim in the same narrow window — but only the syndicate members claim, not their legitimate poolmates.
```text
Syndicate co-claim pattern:
  Pool #7:  10/25 members claim (low consensus)
  Pool #12: 8/28 members claim  (low consensus)
  Pool #19: 12/30 members claim (low consensus)
  ...across 30 pools simultaneously

→ Cross-pool correlation WITH low intra-pool consensus
→ Structurally opposite to a real disruption
→ Graph identifies dense co-claim subgraph spanning pools
   while sparsely connected to legitimate poolmates
→ FRAUD RING FLAGGED
```

These two patterns — real event vs coordinated attack — look completely different in graph space. Legitimate events produce high consensus everywhere. Syndicate events produce low consensus inside pools with suspicious correlation between pools. No GPS check required to distinguish them.

---

### Combined Defense
```text
Pool Fragmentation:  500 attackers split across 30+ isolated pools.
                     Cannot overwhelm the system from a single point.

Peer Consensus:      Low intra-pool consensus exposes fake disruptions
                     without checking GPS coordinates.

Graph Intelligence:  Cross-pool correlation + low intra-pool consensus
                     = unmistakable fraud ring signature detected
                     before payouts are issued.
```

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
