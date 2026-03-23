# ShiftSure Phase 2 — Design Spec

**Date:** 2026-03-23
**Deadline:** 2026-04-04
**Team:** Meow Company — SRM IST
**Hackathon:** Guidewire DEVTrails 2026

---

## Overview

Phase 2 builds the full working ShiftSure application on top of the Phase 1 ideation. The deliverable is a runnable, demonstrable system covering Registration, Insurance Policy Management, Dynamic Premium Calculation, and Claims Management — plus a 2-minute demo video.

Phase 1 produced: README, Figma prototype, trigger definitions, premium model, tech stack spec.
Phase 2 produces: the actual application.

ML-based dynamic pricing is deferred — rule-based formulas from the README are used for Phase 2. The API contracts are designed so ML can be swapped in later with no interface changes.

---

## Repo Structure

Single repository, 4 top-level folders. Each service is independently runnable with its own deps file.

```
shiftsure/
├── mobile/     React Native + Expo (Expo Router, tab navigation)
├── backend/    Node.js + Express + Mongoose
├── admin/      React + Vite + Tailwind CSS
└── ai/         Python + FastAPI
```

All services communicate over HTTP. The backend is the single integration point — mobile and admin talk only to the backend; the backend calls the AI service internally.

---

## Mobile App (React Native + Expo)

**Scaffolding:** `npx create-expo-app mobile` with Expo Router.

### Navigation Structure

```
(auth)/
  login           Phone + password login, returns JWT stored in SecureStore
  register        Onboarding: name, phone, zone, dark store, income band

(tabs)/
  index           Home/Dashboard — active policy summary, wallet balance,
                  zone risk level, recent payout history
  policy          Policy Management — buy/renew weekly plan (Lite/Standard/Plus),
                  dynamic premium displayed before purchase,
                  declare shift slots for the week
  claims          Claims History — list of auto-triggered payouts with
                  reason, amount, timestamp, trigger type
                  (no manual claim button — zero-touch only)
  wallet          Wallet — current balance, payout history,
                  pool surplus rebate received this week
```

Auth flow is outside the tab layout. After JWT is stored, user lands on the tab layout. If no active policy on the Home screen, a prompt directs to the Policy tab.

### Push Notifications

Expo Push Notification Service (no FCM setup required for demo). Push token is stored at registration. Notification format: *"Payout of ₹340 credited — Heavy rain trigger in Koramangala zone."*

---

## Backend (Node.js + Express)

**Auth:** JWT + bcrypt. Single middleware validates token on protected routes. Admin role encoded in JWT payload.

### API Routes (all prefixed `/api`)

```
/auth
  POST /register        Create worker account, return JWT
  POST /login           Validate credentials, return JWT

/workers
  GET  /me              Current worker profile + zone + dark store

/policies
  GET  /premium         Calculate dynamic premium for a plan tier
                        Query param: plan (lite/standard/plus)
                        Zone and pool surplus resolved server-side from the
                        authenticated worker's zone_id and their pool's
                        current surplus field — no additional client params needed
                        Calls AI service /calculate-premium internally
  POST /purchase        Buy weekly policy, store shift slots
                        Creates pool document if none exists for this
                        dark_store_id + week_start (upsert pattern)
                        pool_id on policy = pools._id of that document
  GET  /current         Active policy for logged-in rider

/claims
  GET  /                Rider's payout history (auto-generated, no filing)

/wallet
  GET  /                Balance + transaction log

/admin                  (admin JWT required)
  GET  /claims          All auto-processed claims — filter by zone/date/trigger
  GET  /pools           Pool health per dark store
  POST /trigger         Manual disruption injection — { zone_id, trigger_type, severity }
                        Skips API polling, injects mock values, runs full payout pipeline
  GET  /zones           All zones with current risk status

/mock                   Internal mock feeds (swappable for real APIs)
  GET  /flood/:zone_id          Returns { flood_signal, severe_flood_signal }
  GET  /dispatch/:dark_store_id Returns { dispatch_outage }
```

### MongoDB Collections

```
workers         _id, name, phone, password_hash, zone_id, dark_store_id,
                weekly_income_band (integer, rupees/week e.g. 12000),
                push_token, created_at

policies        _id, worker_id, plan (lite/standard/plus), week_start,
                week_end, shift_slots[], premium_paid, status,
                weekly_cap (integer, rupees — max payout this week),
                payouts_issued_this_week (integer, running total),
                pool_id (MongoDB ObjectId referencing pools._id)

claims          _id, worker_id, policy_id, trigger_event_id, trigger_type,
                risk_score, payout_amount, eligible_hours, created_at

wallets         _id, worker_id, balance,
                transactions[] {
                  type: "payout" | "rebate",
                  amount,
                  description,
                  claim_id (ObjectId, optional — present for payout type),
                  created_at
                }

zones           _id, name, city, lat, lng, base_orders_per_day,
                historical_disruption_rate, current_risk_score

trigger_events  _id, zone_id, trigger_type, risk_score, tier,
                source (auto/manual), rainfall_mm, heat_index, aqi,
                flood_signal, dispatch_outage, created_at

pools           _id, dark_store_id, zone_id, week_start, week_end,
                total_collected, total_claimed, surplus, reserve_used
```

### Trigger Engine (node-cron, every 15 minutes)

```
For each active zone:
  1. Fetch OpenWeatherMap API → rainfall_mm, heat_index, aqi       [real]
       If OpenWeatherMap call fails → log error, skip zone this cycle
       (do not default to zero — that would suppress triggers silently)
  2. Fetch GET /mock/flood/:zone_id → flood_signal                  [mock]
  3. Fetch GET /mock/dispatch/:dark_store_id → dispatch_outage      [mock]
  4. POST to AI /risk-score → composite score + tier
       Pass zone_restriction: false for all automated cycles.
       Only POST /admin/trigger with trigger_type "zone_restriction" passes true.
  5. Update zones.current_risk_score with computed score
  6. If score >= 40:
       Find workers: active policy + current time overlaps shift_slots
       Per worker:
         POST to AI /predict-income (include tier) → payout_amount
         Apply weekly cap: payout = min(payout_amount,
                           policy.weekly_cap - policy.payouts_issued_this_week)
         If capped payout > 0:
           Insert claim record
           Credit wallet (add to balance + transaction log)
           Increment policy.payouts_issued_this_week
       Record trigger_event
       Send Expo push notification (fire-and-forget — failure does not
         roll back wallet credit or claim record)
       Update pool (increment total_claimed)
```

The manual admin trigger at `POST /admin/trigger` runs the same pipeline from step 4 onward, bypassing the API polling phase.

**Pool surplus settlement (weekly, runs every Monday 00:00 via node-cron):**
For Phase 2, pool surplus is a manually seeded value in `pools.surplus`. A settlement cron is not required for the demo — seed realistic surplus values in the DB seed script so the premium rebate displays correctly during the demo.

---

## AI Service (Python + FastAPI)

**Scaffolding:** `fastapi` + `uvicorn`. Auto-generates Swagger UI at `/docs` for judge review.

All endpoints use rule-based formulas from the README. ML upgrade (Ridge Regression, Gradient Boosted Regressor) slots in later with no API contract changes.

### Endpoints

**POST /risk-score**
```
Input:
  zone_id, rainfall_mm, flood_signal, severe_flood_signal,
  dispatch_outage, heat_index, aqi, zone_restriction

Processing (from README formula):
  rain_score     = min(100, rainfall_mm * 4)
  flood_score    = 60 if flood_signal else 100 if severe_flood_signal else 0
  dispatch_score = 80 if dispatch_outage else 0
  heat_score     = 0/<60/100 based on heat_index threshold
  aqi_score      = 0/60/100 based on aqi threshold
  heat_aqi_score = min(100, max(heat_score, aqi_score))
  restriction_score = 80 if zone_restriction else 0

  risk_score = (0.30 * rain_score) + (0.20 * flood_score)
             + (0.20 * dispatch_score) + (0.15 * heat_aqi_score)
             + (0.15 * restriction_score)

Output:
  risk_score (0-100), tier (none/tier1/tier2/full),
  breakdown { rain, flood, dispatch, heat_aqi, restriction }
```

**POST /calculate-premium**
```
Input:
  plan (lite/standard/plus), zone_historical_rate,
  forecast_risk_score, pool_surplus_rebate

Processing:
  base_price     = { lite: 49, standard: 89, plus: 149 }[plan]
  zone_addon     = base_price * zone_historical_rate * 0.2
  forecast_addon = base_price * (forecast_risk_score / 100) * 0.1
  final          = base_price + zone_addon + forecast_addon - pool_surplus_rebate

Output:
  base_price, zone_addon, forecast_addon, rebate, final_premium
```

**POST /predict-income**
```
Input:
  weekly_income_band (integer, rupees/week), tier (none/tier1/tier2/full),
  shift_slots[], trigger_window_start, trigger_window_end, zone_density_factor

Processing:
  base_hourly_rate     = weekly_income_band / total_declared_hours
  eligible_hours       = overlap(shift_slots, trigger_window)
  time_multiplier      = 1.6 if evening peak else 1.4 if lunch else 1.0
  day_type_factor      = 1.2 if weekend else 1.0
  estimated_income     = base_hourly_rate * eligible_hours
                       * time_multiplier * day_type_factor * zone_density_factor
  disruption_mult      = { full: 1.0, tier2: 0.7, tier1: 0.4 }[tier]
  payout               = estimated_income * disruption_mult

Output:
  eligible_hours, estimated_income, payout_amount
```

---

## Admin Dashboard (React + Vite + Tailwind)

4 pages, desktop-first layout.

```
/login          Admin credentials → JWT stored in localStorage

/dashboard      Overview cards:
                  Active pools, total riders insured this week,
                  total payouts issued, city reserve level

/zones          Zone & Trigger Management table:
                  Zone name | City | Current risk score | Active riders | Actions
                  "Simulate Disruption" button per zone
                    → modal: select trigger_type + severity
                    → calls POST /api/admin/trigger
                    → fires full payout pipeline immediately
                  Status refreshes every 30 seconds (polling)

/claims         Claims queue table:
                  Rider name | Zone | Trigger type | Amount | Timestamp | Source
                  Filter by zone / date / trigger type
                  Source column shows "auto" or "manual" — judges can
                  see both automated and manual-triggered payouts
```

---

## Automated Triggers — 5 Triggers in Scope

All sourced as described in the README. For Phase 2:

| Trigger | Source | Status |
|---|---|---|
| Heavy Rain | OpenWeatherMap API (real) | Automated |
| Flood/Waterlogging | Mock feed at `/mock/flood/:zone_id` | Automated + Manual |
| Dark-Store Outage | Mock feed at `/mock/dispatch/:dark_store_id` | Automated + Manual |
| Zone Restriction | Admin flag via `POST /admin/trigger` with `trigger_type: "zone_restriction"` — sets `zone_restriction: true` in the risk score input, producing `restriction_score = 80` | Manual only |
| Extreme Heat / AQI | OpenWeatherMap API (real) | Automated |

The mock feeds are seeded with controllable values. Toggling `dispatch_outage = true` for a dark store via an internal admin call fires the next cron cycle (or instantly via the simulate button).

Valid `trigger_type` enum values for `POST /admin/trigger`: `heavy_rain`, `flood`, `dispatch_outage`, `zone_restriction`, `extreme_heat`.

---

## Zero-Touch Claims UX

From the rider's perspective, the claims process is completely invisible:

1. Rider buys policy + declares shift on Monday
2. On Wednesday evening, rain triggers automatically
3. Rider receives push notification: *"₹340 credited — Rain trigger"*
4. Rider opens app → Home shows updated wallet balance
5. Rider opens Claims tab → new entry with trigger details
6. No action ever required from the rider

There is no "File a Claim" button anywhere in the mobile app.

---

## Dynamic Premium Display Flow

On the Policy screen, before purchase:

1. Rider selects plan tier (Lite / Standard / Plus)
2. App calls `GET /api/policies/premium?plan=standard`
3. Backend fetches zone risk + pool surplus from DB, calls AI `/calculate-premium`
4. Response returned: premium breakdown shown to rider
   ```
   Base price:       ₹89
   Zone risk add-on: ₹12
   Forecast add-on:  ₹6
   Pool rebate:      −₹18
   ─────────────────────
   This week:        ₹89
   ```
5. Rider confirms → `POST /api/policies/purchase`

---

## Constraints & Decisions

- **ML deferred:** All AI endpoints are rule-based for Phase 2. The API contract is stable — ML models slot in without changing callers.
- **No Razorpay:** Wallet is a mock balance. No real payments for Phase 2.
- **GPS is simulated:** No real device GPS required. Zone is set at registration.
- **Expo Push:** Used over FCM for simplicity — sufficient for demo purposes.
- **Mock feeds run inside backend:** No separate mock server needed.
- **Admin auth is separate role:** Same JWT system, `role: "admin"` in payload, checked by middleware.
