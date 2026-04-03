# ShiftSure — Complete Build Prompt

> **Source documents:** `README.md` (product spec), `flow_claim.md` (claims + fraud architecture), `phase2-design.md` (Phase 2 backend/AI/admin spec), `flutter-app-design.md` (Flutter app screen spec). Where documents conflict, the Flutter app design spec (2026-04-03) is the latest and takes precedence.

---

## What You Are Building

**ShiftSure** — an AI-powered parametric income protection platform for grocery/q-commerce delivery riders (Zepto, Blinkit, Swiggy Instamart). Riders buy weekly coverage, declare their shift hours, and file claims when environmental or social disruptions hit. The system verifies claims against live weather APIs, mock feeds, and a graph-based fraud detection layer, then auto-approves or rejects with no human intervention.

**Hackathon:** Guidewire DEVTrails 2026 | **Team:** Meow Company, SRM IST | **Deadline:** 2026-04-04

---

## Repo Structure

Single repository, 4 top-level services. Each independently runnable.

```
shiftsure/
├── mobile/     Flutter (Android + iOS)
├── backend/    Node.js + Express + Mongoose
├── admin/      React + Vite + Tailwind CSS
└── ai/         Python + FastAPI
```

All services communicate over HTTP. The backend is the single integration point — mobile and admin talk only to the backend; the backend calls the AI service internally. Neo4j lives entirely inside the AI service — the backend never touches Neo4j directly.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile App (Rider) | Flutter (single codebase Android/iOS) |
| Admin Dashboard | React + Vite + Tailwind CSS |
| Backend | Node.js + Express + Mongoose |
| AI Service | Python + FastAPI |
| Database | MongoDB Atlas (free M0 tier) |
| Graph DB | Neo4j Aura (free tier, 1 instance, 200K nodes) |
| Weather/AQI | OpenWeatherMap API (free tier) |
| Flood Signal | Mock endpoint (boolean per zone) |
| Dark-Store Feed | Mock endpoint (per dark_store_id) |
| Safety Signal | Mock endpoint (per zone) |

---

## Part 1 — Flutter Mobile App

### Navigation

```
(auth)/
  splash          App logo → checks JWT in SecureStorage → tabs or login
  login           Phone + password → JWT
  register        3-step onboarding

(tabs)/
  home            Dashboard — policy summary, zone risk, wallet balance, recent activity
  policy          Buy/renew weekly plan, declare shifts, premium breakdown
  claims          Claim history list + FAB to file new claim
  wallet          Balance + transaction log
```

Bottom tab bar: **Home | Policy | Claims | Wallet**. Auth screens sit outside tabs. After JWT validation → tabs. If no active policy → Home shows CTA directing to Policy tab.

### Auth Screens

**Splash:** App logo centered. Checks SecureStorage for JWT. Valid → tabs. Missing/expired → login.

**Login:** Phone (numeric) + password (obscured). "Login" button. "New rider? Register" link. Error: invalid credentials (inline), network (banner).

**Register (3 steps):**
```
Step 1: Name, Phone, Password
Step 2: Select Dark Store (single dropdown — zone is derived on backend from dark_store_id)
Step 3: Weekly Income Band (preset brackets: ₹6K / ₹9K / ₹12K / ₹15K)
→ Submit → JWT returned → Home tab
```
Progress indicator (1/3, 2/3, 3/3). Back button per step. The rider never sees "zone" — it's resolved server-side from the dark store.

### Home Tab

Cards stacked vertically:

1. **Delivery Progress** (shown only if total_deliveries < 7) — "{n}/7 deliveries — {7-n} more to activate coverage". Progress bar. Disappears once 7 reached.

2. **Active Policy** — plan name, expiry, effective weekly cap (adjusted for activity tier), remaining (effective_cap - payouts_issued). Worker tier badge ("Regular" / "Low Activity — complete 3+ active days for full coverage"). No policy → "No active plan — Get covered" CTA → Policy tab. Expiring within 1 day → "Expires tomorrow — Renew now" accent styling.

3. **Zone Risk** — composite risk score (0-100) + tier (none/tier1/tier2/full) + progress bar + mini breakdown of active signals (rain, flood, heat, etc.). Fetched on screen load via `GET /api/zones/risk` — computed on-demand, no polling.

4. **Wallet Balance** — balance number. Tap → Wallet tab.

5. **Recent Activity** — last 3 claim items (filed/approved/rejected). Tap → Claims tab.

### Policy Tab

**No active policy → Purchase flow:**

**Single plan — no tier selection.** Premium is dynamically calculated each week. Weekly cap = 20% of rider's declared weekly income, adjusted by activity tier (regular = full cap, low activity = 60%).

**Prerequisite:** Rider must have ≥ 7 total deliveries. If < 7, show "Complete {7-n} more deliveries to buy coverage" instead of the purchase flow.

1. Premium breakdown auto-fetches on load (`GET /api/policies/premium`) showing: base risk premium, city factor, pool rebate, total (₹20–50 range)
2. Coverage section: shows worker tier (Regular/Low Activity) and weekly cap
3. Declare shift slots — day-by-day time pickers (start + end per day, optional per day)
4. "Buy Coverage — ₹{total}" button → `POST /api/policies/purchase` → creates policy + pool (upsert)

**Active policy → Read-only view:**
Premium paid, worker tier, weekly cap, payouts used, remaining, declared shifts (read-only). "Renew for Next Week" button → reopens purchase flow for next week (premium recalculated).

### Claims Tab

**Claims list:** Reverse chronological claim cards. Each card: status badge (🟡 Pending / 🟢 Approved / 🔴 Rejected), trigger type, date, amount (or "calculating..." if pending). Tap → Claim Detail. Empty state: "No claims yet. File your first claim when a disruption affects your shift."

**FAB: "+ File Claim"** — bottom-right floating action button.

**File Claim flow (3 screens):**

Screen 1 — Select trigger type (vertical list):
- 🌧 Heavy Rain (`heavy_rain`)
- 🌊 Flood/Waterlogging (`flood`)
- 🏪 Dark Store Outage (`dispatch_outage`)
- 🚧 Zone Restriction (`zone_restriction`)
- 🌡 Extreme Heat/AQI (`extreme_heat`)
- ⚠️ Unsafe Area (`unsafe_area`)

Screen 2 — Confirm & Submit: auto-populated (type, dark store, today's shift, current time). "Your claim will be verified against live data. You'll be notified of the result." Submit button.

Screen 3 — Confirmation: "Claim Filed. We're verifying your claim now." → "View My Claims" button → back to list.

**Guard rails:**
- No active policy → "Get covered first" (blocks filing, links to Policy tab)
- Coverage not active (< 7 deliveries) → "Complete your deliveries to activate coverage"
- More than 48 hours since last declared shift ended → "Filing window expired — claims must be filed within 48 hours of your shift"
- Same trigger type filed within 30 min → "You already filed a {type} claim at {time}"

**Claim Detail screen:** Trigger type, status badge, filed/resolved timestamps, payout section (eligible hours, amount), verification section (signal values, risk score, peer claim count). Rejected claims show human-readable reason (e.g., "AQI 180, below threshold of 300").

### Wallet Tab

Balance prominently at top. Transaction list (reverse chronological):
- `payout` (green +) — linked to claim_id
- `rebate` (green +) — pool surplus
- `premium` (red −) — plan purchase

No withdrawal/cashout — wallet is mock balance. Empty state: "No transactions yet."

### Notifications

Push on claim resolution:
- Approved: "Claim approved — ₹{amount} credited for {trigger_type} disruption"
- Rejected: "Claim not verified — {reason_summary}"

Tap → deep-link to Claim Detail screen.

---

## Part 2 — Backend (Node.js + Express + Mongoose)

### Auth
JWT + bcrypt. Middleware validates token on protected routes. Admin role encoded in JWT payload (`role: "admin"`).

### API Routes (all prefixed `/api`)

```
/auth
  POST /register              Create worker account (name, phone, password, dark_store_id,
                              weekly_income_band). Backend resolves zone_id from dark_store_id.
                              Return JWT.
  POST /login                 Validate credentials, return JWT.

/workers
  GET  /me                    Current worker profile + dark store + zone

/policies
  GET  /premium               Dynamic premium (single plan, no tier selection)
                              Zone trigger probability, avg daily income loss,
                              city factor, and pool surplus resolved server-side
                              Calls AI /calculate-premium internally
  POST /purchase              Buy weekly policy, store shift_slots[]
                              Upserts pool document for dark_store_id + week_start
  GET  /current               Active policy for logged-in rider

/claims
  GET  /                      Rider's claim history (reverse chronological)
  POST /file                  File a new claim
                              Body: { trigger_type }
                              Worker ID, zone, shift, policy resolved from JWT context
                              Returns { claim_id, status: "pending_verification" }
                              Triggers async verification pipeline

/wallet
  GET  /                      Balance + transaction log

/zones
  GET  /risk                  Current composite risk score for rider's zone
                              Fetches live data (OWM + mocks), calls AI /risk-score
                              Returns { risk_score, tier, breakdown }

/admin                        (admin JWT required)
  GET  /claims                All claims — filter by zone/date/trigger/status
                              Includes fraud_result fields (anomaly, ring, trust)
  POST /claims/:id/override   Override a rejected claim → approved
                              Body: { reason }
                              Credits wallet, trust += 0.1, logs audit
  GET  /pools                 Pool health per dark store + BCR per pool
  GET  /zones                 All zones with current risk status + loss ratio
  POST /simulate-stress       Run stress scenario (e.g., 14-day monsoon)
                              Body: { scenario, zones[], days }
                              Returns projected BCR, loss ratios, pool depletion

/mock                         Internal mock feeds
  GET  /flood/:zone_id                  { flood_signal, severe_flood_signal }
  GET  /dispatch/:dark_store_id         { dispatch_outage }
  GET  /safety/:zone_id                 { unsafe_signal }
```

### MongoDB Collections

```
workers         _id, name, phone, password_hash, zone_id, dark_store_id,
                weekly_income_band (integer, rupees/week),
                total_deliveries (integer, default 0 — coverage activates at ≥ 7),
                active_days_this_week (integer, 0-7),
                worker_tier ("regular" if active_days >= 3, else "low_activity"
                             — same premium, but low_activity gets 60% of weekly_cap),
                push_token, created_at

dark_stores     _id, name, zone_id, city
                (Each dark store maps to exactly one zone)

policies        _id, worker_id, week_start,
                week_end, shift_slots[], premium_paid, status,
                weekly_cap (integer, rupees — 20% of weekly_income_band),
                effective_weekly_cap (integer — weekly_cap × 0.6 if worker_tier
                                     is "low_activity", else weekly_cap),
                payouts_issued_this_week (integer, running total),
                pool_id (ObjectId → pools._id)

claims          _id, worker_id, policy_id, trigger_event_id, trigger_type,
                risk_score,
                payout_amount (computed — stored even if rejected),
                eligible_hours,
                peer_consensus_ratio (float 0-1, metadata),
                status ("pending_verification" | "approved" | "rejected"),
                fraud_result: {
                  graph_anomaly_score (float 0-1, from PageRank),
                  ring_detected ("none" | "soft" | "hard"),
                  trust_score_at_check (float),
                  decision ("approved" | "rejected"),
                  decision_source ("matrix")
                },
                rejection_reason (string, human-readable — null if approved),
                created_at, resolved_at

wallets         _id, worker_id, balance,
                transactions[] {
                  type: "payout" | "rebate" | "premium",
                  amount, description,
                  claim_id (ObjectId, optional),
                  created_at
                }

zones           _id, name, city, lat, lng, base_orders_per_day,
                historical_disruption_rate,
                trigger_probability (float 0-1, historical disruption likelihood/week),
                avg_daily_income_loss (rupees, zone average),
                city_factor (float, e.g. 1.0–1.3),
                current_risk_score

trigger_events  _id, zone_id, trigger_type, risk_score, tier,
                source ("rider" | "admin"),
                rainfall_mm, heat_index, aqi,
                flood_signal, severe_flood_signal,
                dispatch_outage, unsafe_signal,
                created_at

pools           _id, dark_store_id, zone_id, week_start, week_end,
                total_collected, total_claimed, surplus, reserve_used
```

### Claim Verification Pipeline (async, triggered by POST /claims/file)

When a rider files a claim, the backend:

```
1. Validate: active policy, total_deliveries >= 7 (coverage active),
   current time is within 48 hours of a declared shift_slot end time,
   no duplicate (same worker + trigger_type within 30 min)
   → reject early if any check fails

2. Write claim { status: "pending_verification", trigger_type, ... }

3. Fetch live data based on trigger_type:
   - heavy_rain / extreme_heat → OpenWeatherMap API (rainfall_mm, heat_index, aqi)
   - flood → GET /mock/flood/:zone_id (flood_signal, severe_flood_signal)
   - dispatch_outage → GET /mock/dispatch/:dark_store_id (dispatch_outage)
   - zone_restriction → check admin-flagged status for zone
   - unsafe_area → GET /mock/safety/:zone_id (unsafe_signal)

4. POST AI /risk-score → { risk_score, tier, breakdown }
   Pass: zone_id, rainfall_mm, flood_signal, severe_flood_signal,
         dispatch_outage, heat_index, aqi, zone_restriction
   flood_score precedence: 100 if severe_flood_signal, else 60 if flood_signal, else 0

5. If risk_score < 40 → reject claim ("Disruption not verified — risk score {score} below threshold")

6. Compute peer_consensus_ratio:
   - Time-window grouping: count claims filed in same zone + trigger_type within 30 min
   - Event-based: count existing verified claims for same disruption
   - ratio = filing_workers / total_active_shift_workers_in_zone
   (stored as metadata, does NOT gate payout)

7. POST AI /predict-income → { eligible_hours, payout_amount }
   Pass: weekly_income_band, tier, shift_slots,
         trigger_window_start, trigger_window_end, zone_density_factor

8. Apply weekly cap:
   capped = min(payout_amount, policy.weekly_cap - policy.payouts_issued_this_week)
   If capped == 0 → reject claim ("Weekly cap reached")

9. POST AI /fraud-check → { decision, fraud_result }
   Pass: worker_id, zone_id, trigger_event_id,
         trigger_type, peer_consensus_ratio, payout_amount

10. If decision == "approved":
    - Update claim: status → "approved", fraud_result, resolved_at = now
    - Credit wallet: add to balance, append payout transaction
    - Increment policy.payouts_issued_this_week
    - Update pool: increment total_claimed
    - Send push notification

11. If decision == "rejected":
    - Update claim: status → "rejected", fraud_result, resolved_at = now,
                    rejection_reason = human-readable reason
    - NO wallet credit
    - Trust score already reduced by Layer 1 inside AI service

12. Write trigger_event record (source: "rider")
```

### Pool Surplus
For Phase 2, surplus is a manually seeded value in `pools.surplus`. Seed realistic values in the DB seed script so premium rebates display correctly during demo.

---

## Part 3 — AI Service (Python + FastAPI)

Auto-generates Swagger UI at `/docs`. All endpoints are rule-based (ML deferred). API contracts are stable — ML models slot in later with no interface changes.

### POST /risk-score

```
Input:  zone_id, rainfall_mm, flood_signal, severe_flood_signal,
        dispatch_outage, heat_index, aqi, zone_restriction

Processing:
  rain_score        = min(100, rainfall_mm * 4)
  flood_score       = 100 if severe_flood_signal else 60 if flood_signal else 0
  dispatch_score    = 80 if dispatch_outage else 0
  heat_score        = 100 if heat_index >= 47 else 60 if heat_index >= 42 else 0
  aqi_score         = 100 if aqi >= 400 else 60 if aqi >= 300 else 0
  heat_aqi_score    = min(100, max(heat_score, aqi_score))
  restriction_score = 80 if zone_restriction else 0

  risk_score = (0.30 * rain_score) + (0.20 * flood_score)
             + (0.20 * dispatch_score) + (0.15 * heat_aqi_score)
             + (0.15 * restriction_score)

  tier = "full" if risk_score >= 80
         else "tier2" if risk_score >= 60
         else "tier1" if risk_score >= 40
         else "none"

Output: { risk_score, tier, breakdown: { rain, flood, dispatch, heat_aqi, restriction } }
```

### POST /calculate-premium

```
Input:  zone_trigger_probability (float 0-1),
        avg_daily_income_loss (rupees), days_exposed (integer, typically 7),
        city_factor (float, e.g. 1.0–1.3), pool_surplus_rebate (rupees)

Processing:
  base_risk_premium = zone_trigger_probability * avg_daily_income_loss * days_exposed
  adjusted          = base_risk_premium * city_factor
  clamped           = clamp(adjusted, 20, 50)    // target range ₹20–50/week
  final             = max(1, clamped - pool_surplus_rebate)

Output: { base_risk_premium, city_factor, rebate, final_premium }
```

**BCR validation:** target BCR (total_claimed / total_collected) = 0.55–0.70. If BCR drifts outside range, premium inputs (trigger_probability, city_factor) need recalibration.

### POST /predict-income

```
Input:  weekly_income_band (integer), tier, shift_slots[],
        trigger_window_start, trigger_window_end, zone_density_factor

Processing:
  total_declared_hours = sum of all shift_slots durations
  base_hourly_rate     = weekly_income_band / total_declared_hours
  eligible_hours       = overlap(shift_slots, trigger_window)
  time_multiplier      = 1.6 if evening peak (17-23) else 1.4 if lunch (12-14) else 1.0
  day_type_factor      = 1.2 if weekend else 1.0
  estimated_income     = base_hourly_rate * eligible_hours
                       * time_multiplier * day_type_factor * zone_density_factor
  disruption_mult      = { full: 1.0, tier2: 0.7, tier1: 0.4 }[tier]
  payout               = estimated_income * disruption_mult

Output: { eligible_hours, estimated_income, payout_amount }
```

### POST /fraud-check (Dual-Layer Architecture)

**Neo4j Knowledge Graph (InfDetect-inspired):**
```
Nodes:
  (:Worker       { worker_id, trust_score })       — trust starts at 1.0
  (:Zone         { zone_id })
  (:TriggerEvent { trigger_event_id, zone_id, created_at })
  (:Claim        { claim_id, created_at, payout_amount })

Edges:
  (Worker)-[:IN_ZONE]->(Zone)
  (Worker)-[:FILED]->(Claim)
  (Claim)-[:FROM_EVENT]->(TriggerEvent)
  (TriggerEvent)-[:IN_ZONE]->(Zone)
```

**Layer 1 — Graph Intelligence (every claim):**
1. Upsert Worker, Claim nodes + FILED, FROM_EVENT edges into Neo4j
2. Run PageRank on worker's neighborhood → graph_anomaly_score (0-1)
3. Co-claim ring detection (Cypher): find workers who filed in same 30-min window
   - hard ring: >= 5 zones AND avg_consensus < 0.3
   - soft ring: >= 3 zones AND avg_consensus < 0.4
   - none: < 3 zones or consensus >= 0.4
4. Read trust_score from Worker node

**Layer 2 — Decision Matrix (deterministic):**

```
                           | trust >= 0.4  | trust 0.2-0.4 | trust < 0.2
------------------------------------------------------------------------
no ring + anomaly < 0.6    |    PAY        |    PAY         |   BLOCK
no ring + anomaly >= 0.6   |    PAY        |    BLOCK       |   BLOCK
soft ring (3+ zones)       |    PAY        |    BLOCK       |   BLOCK
hard ring (5+ zones)       |    BLOCK      |    BLOCK       |   BLOCK
```

**Trust score updates (after decision):**
- BLOCK → trust -= 0.2
- PAY + soft ring or anomaly >= 0.6 → trust -= 0.1
- PAY + clean → no change

```
Input:  worker_id, zone_id, trigger_event_id,
        trigger_type, peer_consensus_ratio, payout_amount

Output: {
  decision: "approved" | "rejected",
  fraud_result: {
    graph_anomaly_score, ring_detected,
    trust_score_at_check, decision_source: "matrix"
  }
}
```

---

## Part 4 — Admin Dashboard (React + Vite + Tailwind CSS)

5 pages, desktop-first.

**`/login`** — Admin credentials → JWT in localStorage.

**`/dashboard`** — Overview cards: active pools, total riders insured this week, total payouts issued, city reserve level, **BCR (total_claimed / total_collected)** with target band indicator (0.55–0.70 = green, outside = amber/red).

**`/zones`** — Zone management table: Zone name | City | Risk score | Active riders | **Loss Ratio** | Actions. Loss ratio = zone_claims / zone_premiums. **Loss ratio > 85% → red highlight + "Suspend enrollment" warning badge.** "Simulate Disruption" button per zone → modal (select trigger_type + severity). Status refreshes every 30s (polling).

**`/stress-test`** — 14-day monsoon stress simulation page. Runs a simulated scenario (sustained rain triggers across selected zones for 14 days). Outputs: projected BCR, loss ratios per zone, pool depletion timeline, total payouts vs. premiums. Uses `POST /api/admin/simulate-stress`. Results displayed as summary table + pool health chart over time.

**`/claims`** — Claims table with fraud visibility:
Columns: Rider name | Zone | Trigger type | Amount | Status | Ring | Anomaly Score | Trust | Source | Timestamp
- Status: approved (green) / rejected (red) / pending (grey)
- Filter bar: status + zone + date range
- Override button on rejected claims only → modal with reason field → `POST /api/admin/claims/:id/override` → credits wallet, trust += 0.1, audit logged

---

## Part 5 — Triggers (6 total)

| Trigger | Source | Enum Value |
|---|---|---|
| Heavy Rain | OpenWeatherMap (real) | `heavy_rain` |
| Flood/Waterlogging | Mock: `GET /mock/flood/:zone_id` | `flood` |
| Dark-Store Outage | Mock: `GET /mock/dispatch/:dark_store_id` | `dispatch_outage` |
| Zone Restriction | Admin-flagged | `zone_restriction` |
| Extreme Heat/AQI | OpenWeatherMap (real) | `extreme_heat` |
| Unsafe Area | Mock: `GET /mock/safety/:zone_id` | `unsafe_area` |

---

## Part 6 — Key Constraints

- **No real payments:** Wallet is mock balance. No Razorpay.
- **No GPS:** Zone is set at registration via dark store selection. No device GPS.
- **No cron:** Claims are rider-initiated, verified on-demand. No 15-minute polling loop.
- **ML deferred:** All AI endpoints use rule-based formulas. API contracts are ML-ready.
- **Mock feeds run inside backend:** No separate mock server.
- **Pool surplus is seeded:** No settlement cron needed for demo.
- **Admin auth:** Same JWT system, `role: "admin"` in payload.
- **Dark store = zone:** Rider selects dark store, backend resolves zone_id.
- **Pool health hidden from riders:** Only visible on admin dashboard.
- **AQI source:** OpenWeatherMap for Phase 2. Production upgrade: CPCB (Central Pollution Control Board) data feed for India-specific authoritative AQI.
- **Min 7 deliveries:** Coverage activates only after rider completes 7 deliveries. Tracked via `total_deliveries` on worker record (seeded for demo).
- **Activity-based tiering:** Workers with < 3 active days in 7 → `worker_tier: "low_activity"` — same premium, 60% of plan's weekly_cap as effective_weekly_cap.
- **Premium target range:** ₹20–50/week. Single plan, actuarial formula: `trigger_prob × avg_income_loss × days_exposed × city_factor − rebate`, clamped to range. Weekly cap = 20% of weekly_income_band.
- **BCR target:** 0.55–0.70 (total_claimed / total_collected). Monitored on admin dashboard.
- **Loss ratio circuit breaker:** > 85% per zone → "Suspend enrollment" warning on admin zones page (display-only for Phase 2).
- **Stress testing:** Admin can simulate 14-day monsoon scenario to validate system sustainability.
- **48-hour filing window:** Riders can file claims up to 48 hours after declared shift ends, accommodating low-connectivity zones.
- **IRDAI awareness:** ShiftSure is "parametric income protection," not traditional insurance. Regulatory framing for IRDAI sandbox noted for production.

---

## DB Seed Data

Seed the following for demo:
- 3-5 zones (e.g., Koramangala, Indiranagar, HSR Layout, Whitefield, Electronic City) with trigger_probability, avg_daily_income_loss, city_factor values
- 1 dark store per zone
- 5-10 workers across zones with varying income bands
  - Most with total_deliveries ≥ 7 (coverage active)
  - 1-2 with total_deliveries < 7 (to demo activation flow)
  - Mix of active_days_this_week values (some ≥ 3 "regular", some < 3 "low_activity")
- 1-2 active policies with shift_slots and effective_weekly_cap
- 1 zone with loss ratio > 85% (to demo suspension warning)
- Pre-seeded pool documents with realistic surplus values
- Mock feed values (some zones with active flood/outage signals)
- 1 admin user (role: "admin")
