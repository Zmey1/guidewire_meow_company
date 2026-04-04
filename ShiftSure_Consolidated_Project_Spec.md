# ShiftSure — Consolidated Project Specification

**Date:** 2026-04-04
**Version:** v8 (corrected from v7)
**Team:** Meow Company — SRM IST
**Hackathon:** Guidewire DEVTrails 2026

---

## 1. Document Purpose

This document consolidates the current ShiftSure project definition into one place.

It merges the product intent, mobile UX, backend/AI/admin behavior, data model, pricing logic, fraud logic, seed expectations, and current architectural decisions from the various project markdown files, while resolving conflicts between older and newer versions.

### Source-of-truth rules used for this consolidated spec

1. **The newer Flutter rider app design is the primary product source of truth for user flow and claim behavior.**
2. **The later update prompt is the source of truth for plan simplification, premium formula updates, delivery activation gating, activity-based tiering, the 48-hour filing window, BCR, loss ratio, and stress testing.**
3. **Firebase Auth + Firestore are the database/auth source of truth.**
4. **Older zero-touch / automatic-payout-only descriptions are treated as outdated where they conflict with rider-filed claims.**
5. **MongoDB-specific details are ignored.**
6. **Admin-triggered disruptions create disruption events only. They do not directly approve claims or trigger payouts.**
7. **Seed/demo data should include pending claims in addition to approved and rejected claims.**
8. **All risk scoring and premium calculation is performed exclusively by the GLM-Tweedie model. There is no rule-based fallback. Training data is synthetically generated for model warm-up.**

---

## 2. What ShiftSure Is

**ShiftSure** is a parametric income protection platform for grocery and q-commerce delivery partners such as Zepto, Blinkit, and Swiggy Instamart.

The core idea is simple:

- riders buy weekly coverage,
- declare their working shifts,
- file claims when a disruption affects their work,
- and the system verifies those claims using external signals, mock feeds, and fraud checks before approving or rejecting them.

ShiftSure covers **income loss only**. It is not health insurance, accident insurance, life insurance, vehicle insurance, or reimbursement for medical or repair costs.

### Why this problem matters

Q-commerce riders work in highly time-sensitive, hyperlocal conditions. Their weekly earnings can drop sharply due to:

- heavy rain,
- flooding or waterlogging,
- dark-store dispatch outages,
- zone restrictions or closures,
- extreme heat or hazardous AQI,
- unsafe-area conditions.

These are measurable external events, which makes them a natural fit for parametric protection.

---

## 3. Current Product Direction

ShiftSure originally had an older zero-touch concept where payouts could be auto-generated directly from triggers.

That is **not** the current product flow.

### Current flow

The current product is **claim-assisted parametric protection**:

1. Rider buys weekly coverage.
2. Rider declares shifts.
3. A disruption happens.
4. Rider files a claim manually.
5. Backend creates a pending claim.
6. System verifies the claim asynchronously using external evidence and fraud checks.
7. Claim is approved or rejected.
8. If approved, wallet is credited and the rider is notified.

### Important consequence

A disruption event by itself does **not** directly pay riders in the current design.

Admin-created or system-detected disruption events serve as **evidence / context** for verification, not as direct payout commands.

---

## 4. High-Level Architecture

ShiftSure is a multi-service application with a single backend integration layer.

### Services

### 4.1 Rider App
- **Framework:** Flutter
- **Platforms:** Android + iOS
- **Purpose:** registration, login, coverage purchase, shift declaration, claim filing, claim tracking, wallet view, risk view

### 4.2 Backend API
- **Framework:** Node.js + Express
- **Purpose:** authentication verification, worker/profile APIs, policy APIs, claim APIs, wallet APIs, zone risk APIs, admin APIs, mock feed endpoints, orchestration of AI verification flow
- **Data store:** Cloud Firestore
- **Auth verification:** Firebase Admin SDK

### 4.3 Admin Dashboard
- **Form factor:** desktop-first web dashboard
- **Purpose:** monitor zones, pools, claims, loss ratio, BCR, stress testing, and disruption simulation
- **Note:** older docs disagree on the exact frontend framework, but the current product requirement is simply a separate admin web dashboard. The exact frontend framework is secondary to the functional behavior in this consolidated spec.

### 4.4 AI Service
- **Framework:** Python + FastAPI
- **Purpose:** GLM-Tweedie risk scoring, premium calculation, income prediction, and fraud-check orchestration inputs/outputs
- **ML status:** GLM-Tweedie model is the sole scoring and pricing engine. Training data is synthetically generated to bootstrap the model. There is no rule-based fallback path. API contracts are stable and all callers use the GLM output exclusively.

### 4.5 Graph / Fraud Layer
- Graph intelligence is part of the fraud-check path.
- The backend treats it as part of the AI/fraud decision pipeline.
- The graph layer exists to detect coordinated abuse patterns, anomalous behavior, and claim-event mismatches.

---

## 5. Authentication and Identity

ShiftSure now standardizes on **Firebase Auth + Firestore**.

### Auth model
- Mobile rider login uses Firebase Auth.
- Admin login also uses Firebase Auth.
- Backend expects a Firebase ID token in the `Authorization: Bearer <token>` header.
- Backend verifies the token using Firebase Admin SDK.
- Worker/admin role and profile details are stored in Firestore.

### Role model
- `role: "rider"`
- `role: "admin"`

### Worker identity model
Each authenticated rider has:
- Firebase Auth user
- matching Firestore worker document
- wallet document
- optional active policy
- claim history
- zone and dark-store linkage

---

## 6. Current User Journey

# Registration Flow

## 6. Current User Journey

### 6.1 Registration

The rider app uses a 3-step registration flow:

1. Name, phone, password
2. Dark store selection
3. Weekly income retrieval via mock API

The rider does **not** choose a zone manually. The backend resolves `zone_id` from the chosen `dark_store_id`.

The rider also does **not** manually select a weekly income band during registration. Instead, the system fetches the rider’s current or recent weekly income from a mock API and uses that value for downstream pricing, eligibility, and claim calculations.

### Weekly Income Source

Weekly income is obtained from a mock API after the rider completes registration details.

#### Example behavior
- Rider enters name, phone, and password
- Rider selects dark store
- Backend calls mock income API for that rider
- Retrieved income is stored in the rider profile
- This income value is used in place of manual income band selection

#### Example mock API response
```json
{
  "worker_id": "worker_123",
  "weekly_income": 12000,
  "currency": "INR",
  "source": "mock_income_api"
}
```

### Notes
- This replaces the earlier manual weekly income band selection step
- The fetched income can later be mapped to an internal income band if needed for pricing logic
- For demo purposes, the mock API may return fixed or seeded income values by rider
---

### 6.2 Login
Rider logs in using phone/password via Firebase Auth and is taken into the tab-based app.

---

### 6.3 Home Tab
The rider home dashboard shows at-a-glance coverage and operating context.

#### Cards / sections
1. **Delivery Progress**
   Only visible if `total_deliveries < 7`.
   Example: `3/7 deliveries — 4 more to activate coverage`

2. **Active Policy**
   Shows coverage status, expiry, worker tier, effective weekly cap, payouts used, remaining amount.
   If no policy exists, this becomes a CTA to buy coverage.

3. **Zone Risk**
   Shows current composite risk score, tier label, progress bar, and active signal breakdown.

4. **Wallet Balance**

5. **Recent Activity**
   Last claim / payout related items.

---

### 6.4 Policy Tab
This tab manages purchase or renewal of weekly coverage.

#### Key current rule
There is now **one single ShiftSure coverage plan**.
Older Lite / Standard / Plus plan tiers are removed.

#### Purchase prerequisites
A rider cannot buy coverage until `total_deliveries >= 7`.

If `total_deliveries < 7`:
- purchase flow is blocked
- the screen shows progress toward coverage activation instead

#### Purchase flow
1. Premium breakdown is fetched from the backend.
2. Rider sees coverage details.
3. Rider declares shift slots for the week.
4. Rider purchases coverage.

#### Coverage values
- `weekly_cap = 20% of weekly_income_band`
- `effective_weekly_cap = weekly_cap` for `active` workers
- `effective_weekly_cap = weekly_cap × 0.6` for `partly_active` workers

#### Activity-based tiering
- `active` if `active_days_this_week >= 3`
- `partly_active` if `active_days_this_week < 3`

Worker tier is evaluated **at the end of each week** using the platform-imported `active_days_this_week` value. The tier and `effective_weekly_cap` are fixed for the entire policy week and do not change mid-week.

The premium does **not** change by activity tier.
Only the effective payout cap changes.

---

### 6.5 Claims Tab
The current app includes an explicit claim filing flow.

#### List view
Claims are shown in reverse chronological order with status badges:
- Pending
- Approved
- Rejected

#### FAB
The rider can tap **+ File Claim** to start filing.

#### Filing flow
1. Select trigger type
2. Review auto-filled confirmation details
3. Submit
4. Return to claim history with a newly created **pending** claim

#### Trigger options
- `heavy_rain`
- `flood`
- `dispatch_outage`
- `zone_restriction`
- `extreme_heat`
- `unsafe_area`

#### Guard rails before filing
Claim filing is blocked if:
- no active policy exists
- `total_deliveries < 7`
- the filing window expired
- the same trigger type was already filed by the same worker within 30 minutes

#### Filing window
Claims can be filed up to **48 hours after the end of a declared shift**.

This replaces the older "must file during the shift" restriction.

---

### 6.6 Wallet Tab
The wallet is an in-app balance ledger backed by real payment rails.

#### Supported transaction types
- `premium`
- `payout`
- `rebate`
- `withdrawal`

Riders can initiate withdrawals from their wallet balance. Real cashout flow is active.

---

### 6.7 Notifications
Riders receive notifications when pending claims are resolved.

#### Approved
`Claim approved — ₹{amount} credited for {trigger_type} disruption`

#### Rejected
`Claim not verified — {reason_summary}`

Notification taps should deep-link to the claim detail view.

---

## 7. Coverage Logic

ShiftSure covers **income loss due to verified disruptions** affecting the rider's declared work.

Coverage applies when:
- the rider has active coverage,
- `total_deliveries >= 7`,
- the rider files within the allowed window,
- the disruption is verified,
- payout remains available under the weekly cap,
- fraud checks do not block the claim.

### Included protection
- missed delivery income during verified disruptions
- missed shift time due to environmental or platform-side disruptions
- loss occurring in the rider's declared operating context

### Excluded
- health / medical cover
- accident cover
- life cover
- vehicle repair
- reimbursement-style insurance flows

---

## 8. Trigger Model

ShiftSure currently supports **six** disruption trigger categories.

### 8.1 Heavy Rain
- source: OpenWeatherMap
- field: `rainfall_mm`

### 8.2 Flood / Waterlogging
- source: municipal flood monitoring feeds and admin-logged zone state
- fields: `flood_signal`, `severe_flood_signal`

### 8.3 Dark-Store Dispatch Outage
- source: dark-store platform outage feed
- field: `dispatch_outage`

### 8.4 Zone Restriction
- source: admin-flagged disruption state / event
- field: `zone_restriction`

### 8.5 Extreme Heat / AQI
- source: OpenWeatherMap or similar environmental feed
- fields: `heat_index`, `aqi`

### 8.6 Unsafe Area
- source: safety intelligence feed (civic authority and platform signals)
- field: `unsafe_signal`

### 8A. Trigger Validation Requirement
All triggers must satisfy a minimum correlation with observed income loss before being used in verification or pricing:

```text
Corr(Trigger, IncomeLoss) > 0.6
```

Triggers that fall below this threshold are recalibrated or suspended from use. This is the primary basis risk control. Recalibration is performed at least every 6 months, or immediately upon breach.

---

## 9. Risk Scoring

All risk scoring is performed exclusively by the **GLM-Tweedie model** in the AI service. There is no rule-based composite formula. The model is bootstrapped with synthetically generated training data and refines on accumulating real claims data over time.

### Inputs to the GLM risk scorer
- `rainfall_mm`
- `flood_signal`
- `severe_flood_signal`
- `dispatch_outage`
- `heat_index`
- `aqi`
- `zone_restriction`
- `unsafe_signal`

### GLM expected loss formula

```text
ExpectedLoss = exp(
    β0
  + β1·Rain
  + β2·Flood
  + β3·DispatchOutage
  + β4·Heat
  + β5·ZoneRestriction
  + β6·UnsafeArea
)
```

All six trigger types are represented as covariates. The score is normalized and mapped to a risk tier.

### Risk tiers
- `< 40`  → `none`
- `40–59` → `tier1`
- `60–79` → `tier2`
- `>= 80` → `full`

If `risk_score < 40`, the claim is rejected with reason: disruption not verified / score below threshold.

---

## 9A. Dynamic Coverage Ratio

The coverage ratio determines what fraction of estimated income loss is paid out on an approved claim. It is computed dynamically at claim time from two live inputs: the zone's current GLM risk level and the pool's financial health. It is bounded within `[0.55, 0.70]`.

### Step 1 — Normalize zone risk (R)

The GLM-Tweedie model produces an expected loss for the zone:

```text
ExpectedLoss = exp(β0 + β1·Rain + β2·Flood + β3·DispatchOutage + β4·Heat + β5·ZoneRestriction + β6·UnsafeArea)
```

This is normalized to a 0–1 risk score:

```text
R = clamp(ExpectedLoss / RiskReference, 0, 1)
```

- `RiskReference` = the expected loss level representing severe disruption conditions (calibrated from historical data)
- `R = 0` → minimal disruption risk
- `R = 1` → very high disruption risk

Higher R → system is under stress → lower coverage ratio.

### Step 2 — Normalize pool health (P)

```text
BCR = PremiumPool / ExpectedClaims    ← solvency view: how many times the pool covers expected claims

P = clamp((BCR − 1) / BCR_max, 0, 1)
```

- `BCR_max` = healthy pool buffer threshold (calibrated value; reference: 1.8)
- `P = 0` → stressed pool
- `P = 1` → very healthy pool

Higher P → pool can sustain more coverage → higher coverage ratio.

### Step 3 — Combine into stability score (S)

```text
S = w1 × (1 − R) + w2 × P

  w1 = 0.6   (zone risk weight)
  w2 = 0.4   (pool health weight)
  w1 + w2 = 1
```

Higher S means the system can afford higher payouts.

### Step 4 — Compute coverage ratio

```text
coverage_ratio = 0.55 + 0.15 × S
```

This guarantees `0.55 ≤ coverage_ratio ≤ 0.70` by construction.

### Example

| Variable | Value |
|---|---|
| Normalized zone risk R | 0.40 |
| Normalized pool health P | 0.70 |

```text
S = 0.6 × (1 − 0.40) + 0.4 × 0.70
S = 0.36 + 0.28
S = 0.64

coverage_ratio = 0.55 + 0.15 × 0.64
coverage_ratio = 0.646

scaled_payout = income_loss × 0.646
```

### Why this is sound
- **Actuarially grounded** — uses GLM-Tweedie expected loss, not a heuristic
- **Pool-stabilizing** — automatically tightens coverage when the pool is stressed
- **Regulator-transparent** — fully deterministic and auditable
- **Bounded** — can never go below 0.55 (rider protection floor) or above 0.70 (pool safety ceiling)

### Implementation note
`coverage_ratio` is computed by the AI service at claim time and returned as part of the `/predict-income` response. It is stored on the claim record (see §16.6).

---

## 10. Premium Model

ShiftSure uses a **single-plan GLM-Tweedie actuarial premium formula**. There is no rule-based fallback. The GLM is bootstrapped with synthetically generated training data.

### Client-facing constraint
Premium is always clamped to the **₹20–50/week** range.

### Actuarial premium formula (GLM-Tweedie)

```text
Premium = E[L] + λ × sqrt(Var(L)) + Expense + CapitalCost − pool_surplus_rebate

  E[L]                = expected loss from disruption (GLM output)
  Var(L)              = φ × μ^p   (Tweedie variance)
                            φ = dispersion parameter (estimated from training data)
                            μ = E[L]
                            p = Tweedie power, 1 < p < 2
  λ                   = risk loading coefficient, target range 0.40–0.60
                            calibrated to keep weekly insolvency probability < 0.3%
  Expense             = admin and operational cost allocation
  CapitalCost         = cost of holding solvency reserve capital
  pool_surplus_rebate = surplus rebate from prior pool week
```

### Final premium computation

```text
raw_premium   = E[L] + λ × sqrt(Var(L)) + Expense + CapitalCost
clamped       = clamp(raw_premium, 20, 50)
final_premium = max(1, clamped − pool_surplus_rebate)
```

The clamp to `[₹20, ₹50]` is a hard constraint. `final_premium` is always at least ₹1 after the rebate is applied.

The risk loading coefficient λ is calibrated to maintain:
- weekly insolvency probability < 0.3%
- annual ruin probability < 5%

### What the rider sees
- expected loss component
- risk loading component
- pool rebate applied
- final premium

---

## 11. Mutual Micro-Pool Model

ShiftSure uses a weekly **mutual micro-pool** structure.

Each dark store functions as a natural pool boundary because workers assigned to that store share:
- zone exposure,
- dispatch conditions,
- similar disruption patterns,
- similar operating environment.

### Premium flow conceptually
A rider's premium contributes to:
1. operating/platform fee
2. city reserve
3. dark-store pool risk fund

### Pool behavior
- claims for riders in the pool are paid from pool-linked funds
- surplus can reduce future premiums via rebate credits
- admin views pool health directly
- riders do not need detailed pool-level analytics exposed in the rider app

### Surplus formula

Per approved claim, the uncovered portion is:

```text
uncovered_loss = income_loss - capped_payout
```

**Important:** this uses `capped_payout` (the final payout after the weekly cap is applied), not `scaled_payout` (the pre-cap value). Using `scaled_payout` understates uncovered loss whenever the cap is binding.

Pool-level surplus at week-end:

```text
pool_surplus = total_collected - total_claimed
```

A share of `pool_surplus` is allocated to:
1. solvency reserves
2. volatility buffer
3. rider rebate credit pool (reduces next week's premium)


---

## 12. Claim Verification Pipeline

This is the core current project pipeline.

### Step 1: Rider files a claim
`POST /api/claims/file`

Input from rider:
- trigger type only

Resolved server-side:
- worker
- dark store
- zone
- active policy
- shift context

### Step 2: Early validation
Backend checks:
- authenticated rider exists
- active policy exists
- `total_deliveries >= 7`
- current time is within 48 hours of some declared shift end
- no duplicate same-trigger filing within 30 minutes

If any of these fail, the claim is rejected early with a user-facing reason.

### Step 3: Create pending claim
A claim record is created with status `pending_verification`. This pending claim is visible in the rider UI and admin UI immediately.

### Step 4: Gather disruption evidence
Backend fetches evidence based on trigger type.

Examples:
- weather API for rain / heat / AQI (OpenWeatherMap; CPCB for AQI)
- municipal flood monitoring feed
- dark-store platform outage feed
- safety intelligence feed
- recent admin-created disruption events where relevant

### Step 5: Run risk scoring
Backend calls AI `/risk-score` with the resolved evidence. The GLM-Tweedie model returns a normalized risk score. If `risk_score < 40`, the claim is rejected with reason: disruption not verified / score below threshold.

### Step 6: Compute peer consensus metadata
Backend groups related nearby claims by same zone, same trigger type, and same recent time window. This produces `peer_consensus_ratio` metadata used in fraud evaluation.

### Step 7: Predict eligible income loss
Backend calls AI `/predict-income`.

Inputs include:
- worker weekly income band
- worker tier (`active` or `partly_active`) locked at the start of the current policy week
- declared shift slots
- trigger window
- zone density factor
- `weekly_hours` (imported from platform)

Outputs include:
- `eligible_hours` — overlap between the rider's declared shift slots and the verified trigger window
- `income_loss` (estimated gross income loss)
- `coverage_ratio` (dynamically computed per §9A)
- `scaled_payout` (pre-cap intermediate: `income_loss × coverage_ratio`)

**Income loss formula used by AI service:**

```text
hourly_income = weekly_income_band / weekly_hours
income_loss   = hourly_income × eligible_hours × demand_factor
scaled_payout = income_loss × coverage_ratio
```

`demand_factor` is an actuarial multiplier (range 0.8–1.1) accounting for demand elasticity and surge pricing effects. It is empirically calibrated from platform delivery data.

`coverage_ratio` is dynamically computed per §9A and falls in the range `[0.55, 0.70]`.

**Payout cap is based on the rider's activity tier (locked at week-end, immutable mid-week):**
- `active` workers → `effective_weekly_cap = weekly_cap`
- `partly_active` workers → `effective_weekly_cap = weekly_cap × 0.6`

### Step 8: Apply payout cap

```text
remaining_cap  = effective_weekly_cap - payouts_issued_this_week
capped_payout  = min(scaled_payout, remaining_cap)
uncovered_loss = income_loss - capped_payout
```

`capped_payout` is the final payout amount stored as `payout_amount` and credited to the wallet.

**Note:** `uncovered_loss` must be derived from `capped_payout`, not `scaled_payout`. When the cap bites, using `scaled_payout` understates the uncovered portion and corrupts pool surplus calculations.

If remaining cap is zero: reject claim with reason — weekly cap reached.

### Step 9: Fraud evaluation
Backend calls the fraud-check path with worker context, event context, trigger type, peer consensus metadata, and payout amount.

### Step 10: Final decision

If approved:
- claim status → `approved`
- wallet credited by `capped_payout`
- payout transaction written
- `uncovered_loss` stored on the claim
- `payouts_issued_this_week` on policy incremented by `capped_payout`
- pool `total_claimed` updated
- notification sent

If rejected:
- claim status → `rejected`
- rejection reason stored
- wallet unchanged
- notification sent

### Step 11: Trigger event association
Claims are associated with disruption evidence via `trigger_event_id` where applicable.

---

## 12A. Two-Phase Mathematical Flow

The premium pricing flow and the claim settlement flow are **separate processes** that run at different times.

### Phase 1: Actuarial pricing (runs at policy purchase time)

```text
E[L], Var(L) = φ × μ^p  →  raw_premium = E[L] + λ√Var(L) + Expense + CapitalCost
    ↓
clamped to [₹20, ₹50]
    ↓
final_premium = max(1, clamped − pool_surplus_rebate)
    ↓
Rider pays premium  →  TotalPremiumPool += final_premium
```

All pricing is performed exclusively by the GLM-Tweedie model using synthetically bootstrapped training data.

### Phase 2: Claim settlement (runs per approved claim, independently)

```text
hourly_income  = weekly_income_band / weekly_hours
    ↓
income_loss    = hourly_income × eligible_hours × demand_factor
    ↓
scaled_payout  = income_loss × coverage_ratio          ← pre-cap intermediate
    ↓
capped_payout  = min(scaled_payout, remaining_cap)     ← final payout (= payout_amount)
    ↓
uncovered_loss = income_loss − capped_payout           ← feeds pool surplus
    ↓
total_claimed += capped_payout
pool_surplus   = total_collected − total_claimed       ← settled at week-end
surplus share  → reserves + rider rebate credits
```

**Key rule:** the premium collected in Phase 1 does not change based on Phase 2 outcomes within the same policy week. Pool margin is only known at week-end settlement.

---

## 13. Fraud and Graph Intelligence

Fraud detection is important because ShiftSure is not doing pure blind auto-payouts.

The project's fraud story is based on a graph-style intelligence layer inspired by insurance fraud graph approaches.

### What the graph layer is supposed to detect
- clustered claims in the same zone
- claims that do not match real-world events
- coordinated behavior across multiple workers
- repeated suspicious patterns
- hidden relationships between claims and zones

### Conceptual graph entities
- Worker
- Zone
- Trigger Event
- Claim
- possibly Device / account linkage in extended versions

### Key product principle
Peer reporting and clustered behavior matter.
A disruption is not trusted only because one worker filed a claim.
Consensus and event corroboration are major ingredients in the anti-fraud story.

### Current intended role of peer consensus
Peer consensus is an important fraud and verification signal. It should materially influence fraud evaluation and the credibility of the claim-event relationship.

---

## 14. Admin Trigger / Disruption Event Model

Older docs and testing steps treated admin trigger as an instant payout action. That is no longer correct.

### Current meaning of admin trigger
Admin-triggered disruption actions should create or register a **disruption event only**.

They should:
- create evidence/context for later claim verification
- possibly update relevant mock or event state
- make the event visible in admin monitoring

They should **not**:
- directly approve claims
- directly credit wallets
- directly run payout loops on all riders

Admin-created disruption events are stored in the `trigger_events` collection with `source: "admin"`, the same collection used by system-generated events. The `source` field distinguishes them.

---

## 15. Admin Dashboard Responsibilities

The admin dashboard is meant for operational oversight.

### 15.1 Dashboard
Should include:
- active pools
- riders insured
- total payouts
- city reserve level
- BCR and Loss Ratio overview

#### BCR and Loss Ratio

These two metrics describe the same pool health from opposite directions and are mathematical inverses:

```text
LossRatio = total_claimed / total_collected    ← industry standard: fraction of premiums paid as claims
BCR       = total_collected / total_claimed    ← solvency view: how many times the pool covers claims
BCR       = 1 / LossRatio
```

Target ranges:

| Metric | Healthy range | Interpretation |
|---|---|---|
| LossRatio | 0.60–0.75 | Sustainable claims-to-premium ratio |
| BCR | 1.33–1.67 | Pool can cover 1.33–1.67× expected claims |

- LossRatio above 0.75 → pool paying out more than sustainable; review zone risk and consider premium adjustment
- LossRatio below 0.60 → pool accumulating strong surplus; increase rider rebate credits

### 15.2 Zones Page
Should include:
- zone name
- city
- current risk status
- active riders
- loss ratio
- `enrollment_suspended` status
- disruption simulation / creation controls

#### Loss ratio warning and auto-suspension
If a zone's loss ratio exceeds **85%**, the system **automatically suspends new policy enrollment** for that zone. The suspension state is stored on the zone document (`enrollment_suspended: true`) and mirrored in `zone_config` for admin override and audit. The admin dashboard surfaces the suspension status and provides a manual re-enable control. The policy purchase flow checks `enrollment_suspended` at purchase time and blocks the purchase if true.

### 15.3 Claims Page
Should support:
- filters by zone, date, trigger, status
- pending / approved / rejected visibility
- fraud visibility fields such as anomaly, ring, trust, source where available
- optional admin override flow for rejected claims

### 15.4 Stress Test
Admin can run a stress simulation such as a 14-day monsoon scenario.

The goal is to project:
- payout behavior
- pool depletion risk
- BCR
- zone-level loss ratio

---

## 16. Data Model

This section standardizes the current Firestore-oriented schema.

### 16.1 workers
Fields include:
- `name`
- `phone`
- `email`
- `role`
- `dark_store_id`
- `zone_id`
- `weekly_income_band`
- `total_deliveries`
- `active_days_this_week` — imported from the platform (Zepto/Blinkit/Swiggy) at week-end
- `weekly_hours` — imported from the platform alongside `active_days_this_week`; used in income loss calculation
- `worker_tier` — `active` or `partly_active`; evaluated at week-end and locked for the policy week
- `push_token`
- `created_at`

### 16.2 dark_stores
Fields include:
- `name`
- `zone_id`
- `city`

Each dark store maps to exactly one zone.

### 16.3 zones
Fields include:
- `name`
- `city`
- `lat`
- `lng`
- `base_orders_per_day`
- `historical_disruption_rate`
- `current_risk_score`
- `zone_density_factor`
- `trigger_probability`
- `avg_daily_income_loss`
- `city_factor`
- `enrollment_suspended` — boolean; set to `true` automatically when zone loss ratio exceeds 85%
- live signal state fields: `rainfall_mm`, `flood_signal`, `severe_flood_signal`, `dispatch_outage`, `heat_index`, `aqi`, `zone_restriction`, `unsafe_signal`

### 16.4 zone_config
A separate collection mirroring zone enrollment and operational override state for admin audit purposes.

Fields include:
- `zone_id`
- `enrollment_suspended`
- `suspension_reason`
- `suspended_at`
- `reinstated_at`
- `reinstated_by` (admin user id)
- `updated_at`

### 16.5 policies
Fields include:
- `worker_id`
- `zone_id`
- `dark_store_id`
- `week_start`
- `week_end`
- `shift_slots`
- `premium_paid`
- `status`
- `weekly_cap`
- `effective_weekly_cap` — set at purchase time based on worker tier; immutable for the policy week
- `worker_tier_at_purchase` — snapshot of `active` or `partly_active` at purchase time
- `payouts_issued_this_week`
- `pool_id`
- `created_at`

### 16.6 claims
Fields include:
- `worker_id`
- `policy_id`
- `zone_id`
- `dark_store_id`
- `trigger_type`
- `trigger_event_id`
- `risk_score`
- `income_loss` — estimated gross income loss before coverage ratio
- `scaled_payout` — pre-cap intermediate (`income_loss × coverage_ratio`)
- `payout_amount` — final amount after cap (= `capped_payout`); credited to wallet
- `uncovered_loss` — `income_loss − payout_amount`; used in pool surplus calculation
- `coverage_ratio` — dynamically computed ratio applied for this claim
- `eligible_hours`
- `peer_consensus_ratio`
- `status`
- `fraud_result`
- `rejection_reason`
- `source`
- `created_at`
- `resolved_at`

### 16.7 wallets
Fields include:
- `worker_id`
- `balance`
- `transactions[]` — array of transaction records

Each transaction record includes:
- `type` — one of `premium`, `payout`, `rebate`, `withdrawal`
- `amount`
- `reference_id` — claim id (for payouts), policy id (for premiums), or null
- `created_at`

### 16.8 trigger_events
Fields include:
- `zone_id`
- `trigger_type`
- `risk_score`
- `tier`
- `source` — `"system"` for feed-generated events, `"admin"` for admin-created disruption events
- relevant signal values
- `created_at`

### 16.9 pools
Fields include:
- `dark_store_id`
- `zone_id`
- `week_start`
- `week_end`
- `total_collected`
- `total_claimed`
- `surplus`
- `reserve_used`

---

## 17. Core API Surface

This is the current intended API structure.

### Auth / identity
- worker registration / login handled with Firebase Auth
- backend consumes Firebase ID tokens

### Worker APIs
- current worker profile
- dark store + zone resolution
- worker tier and delivery progress

### Policy APIs
- get premium
- purchase weekly coverage (checks `enrollment_suspended` on zone before proceeding)
- get current active policy

### Claim APIs
- list worker claims
- file claim
- get claim detail if needed

### Wallet APIs
- get wallet balance and transactions

### Zone APIs
- get current zone risk for authenticated rider

### Admin APIs
- get claims (with filters: zone, date, trigger, status)
- get pools
- get zones
- create disruption event
- run stress simulation
- optional override flows for rejected claims
- toggle zone enrollment suspension (manual re-enable after auto-suspension)

### External feed integrations
- weather API (OpenWeatherMap)
- AQI feed (CPCB)
- municipal flood monitoring feed
- dark-store platform outage feed (also source of `active_days_this_week` and `weekly_hours`)
- safety intelligence feed

---

# Seed Data Requirements

## 18. Seed Data Requirements

The seed data must match the **current** product flow, not the outdated zero-touch-only flow.

We need enough data for a proper pool, with synthetically generated history and enough riders to simulate a realistic working system.

### It should include

- multiple zones
- one or more dark stores per zone
- several riders with mixed income bands
- at least one admin user
- riders both above and below the activation threshold (`total_deliveries >= 7`)
- a mix of `active` and `partly_active` workers
- active policies, with `worker_tier_at_purchase` and `effective_weekly_cap` set correctly per tier
- expired historical policies
- realistic pool documents with surplus
- realistic wallet balances and transaction histories, including:
  - `premium`
  - `payout`
  - `rebate`
  - `withdrawal`
- current live signal state seeded for all zone signal fields
- system-generated trigger events (`source: "system"`)
- at least one admin-created disruption event (`source: "admin"`)
- at least one zone with `enrollment_suspended: true` and a corresponding `zone_config` record

### Claims in seed data should include all three major states

- `pending_verification`
- `approved`
- `rejected`

### Why pending claims matter

The current rider app flow explicitly expects riders to see pending claims after filing, before final resolution.

Seed data should reflect that so both the rider app and admin dashboard show the real intended lifecycle.

### Important cleanup principle

Seed scripts should avoid piling duplicate historical transactions and duplicate current-week records on repeated runs.

The data should remain stable across reseeds.

---

## 19. Testing Implications

The older testing guide is no longer the right behavioral reference for the current architecture.

### Outdated expectations to avoid
- admin trigger instantly approving and paying claims
- claim history being purely auto-generated
- no manual claim filing flow
- zero-touch-only payout UX
- rule-based risk scoring or premium calculation

### Updated testing priorities
Testing should now verify:
- registration and login
- delivery activation gating (`total_deliveries >= 7` is the canonical condition)
- GLM-Tweedie premium calculation clamped to `[₹20, ₹50]`
- activity-tier cap behavior (`active` vs `partly_active`)
- tier locked at week-end; does not change mid-week
- policy purchase blocked when `enrollment_suspended: true` on zone
- manual claim filing
- pending claim creation
- verification and resolution flow
- wallet updates only after approval
- rejection reasons
- admin disruption event creation (stored with `source: "admin"` in `trigger_events`)
- auto-suspension of zone enrollment when loss ratio exceeds 85%
- admin manual re-enable of zone enrollment
- BCR and loss ratio outputs and their inverse relationship
- stress-test projection outputs
- Firestore indexes needed for compound queries
- **cap-binding scenario:** claim where `scaled_payout > remaining_cap`; verify `payout_amount = remaining_cap` and `uncovered_loss = income_loss − remaining_cap`
- **surplus formula:** verify `uncovered_loss` is stored on approved claims using `capped_payout`, not `scaled_payout`
- **two-phase independence:** verify premium collected at purchase time does not change when claims are filed later in the same policy week
- **unsafe area scoring:** verify claims with `trigger_type: unsafe_area` produce a non-zero GLM risk score via the β6 covariate

---

## 20. Current Implementation Scope

All of the following are active implementation targets in the current build.

### ML and actuarial
- GLM-Tweedie risk scoring (log-link; Var(L) = φ × μ^p; risk loading λ = 0.40–0.60) as the sole scoring and pricing engine
- synthetic training data generation for GLM bootstrap
- empirical calibration of `demand_factor` from platform delivery data
- ML-based income prediction
- richer anomaly and fraud models in the graph intelligence layer

### Data and compliance
- CPCB as the AQI data source for India-specific deployment
- IRDAI compliance integration and regulatory filing support
- richer device and account graph linkage for fraud detection

### Settlement and payments
- real settlement mechanics at week-end pool close
- real payment rails for wallet cashout
- stronger admin review tooling including override audit logs

### Reinsurance
- stop-loss reinsurance protecting the pool against extreme claims scenarios
- intended production layers: Primary pool (up to ₹25,000) → Stop-loss reinsurance (₹25,000–₹60,000) → Insurer solvency capital (above ₹60,000)

---

## 21. Final System Summary

ShiftSure is a production parametric income protection platform for q-commerce delivery workers. Riders buy weekly coverage, declare shifts, manually file disruption claims, and receive asynchronous approval or rejection after external signal verification, GLM-Tweedie risk scoring (the sole scoring and pricing engine, bootstrapped with synthetic training data), ML-based income estimation, payout-cap checks based on activity tier (`active` or `partly_active`, locked at week-end), and graph-layer fraud evaluation. Approved payouts are credited to real wallets with cashout via payment rails. The pool settles weekly, with surplus allocated to solvency reserves and rider rebate credits. Stop-loss reinsurance protects against tail risk. Zone enrollment is automatically suspended when loss ratio exceeds 85%, with admin override to reinstate. The system is built for IRDAI compliance and operates on live environmental, platform, and safety feeds.
