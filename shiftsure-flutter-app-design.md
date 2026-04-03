# ShiftSure Flutter App — Screen-by-Screen Design Spec

**Date:** 2026-04-03
**Deadline:** 2026-04-04
**Team:** Meow Company — SRM IST
**Hackathon:** Guidewire DEVTrails 2026

---

## Overview

This spec defines every screen in the ShiftSure Flutter mobile app. The app is the rider-facing client for ShiftSure's parametric income protection platform.

**Key architectural shift from Phase 2 design spec:** Claims are **rider-initiated** (manual filing), not zero-touch automated. There is no 15-minute cron engine. The rider files a claim when they experience a disruption, the system verifies it asynchronously against external APIs and graph intelligence, then notifies the rider of the result.

**Tech:** Flutter (single codebase, Android + iOS). State management and push notification approach to be decided during implementation planning.

---

## Navigation Structure

```
(auth)/
  splash          App logo + loading → checks JWT in SecureStorage
  login           Phone + password login → JWT
  register        Multi-step onboarding (3 steps)

(tabs)/
  home            Dashboard — policy summary, zone risk, wallet balance, recent activity
  policy          Buy/renew weekly plan, shift declaration, premium breakdown
  claims          Claim history list + FAB to file new claim
  wallet          Balance, transaction log
```

Auth screens sit outside the tab navigator. After JWT validation, user lands on tabs. If no active policy, home shows a prompt card directing to the Policy tab.

Bottom tab bar: **Home | Policy | Claims | Wallet**

---

## Auth Screens

### Splash Screen

- App logo centered on brand-colored background
- Auto-checks for stored JWT in SecureStorage
- Valid JWT → navigate to tabs
- Expired or missing JWT → navigate to login

### Login Screen

- Phone number field (numeric input)
- Password field (obscured)
- "Login" button (full-width, primary color)
- "New rider? Register" link at bottom
- Error states: invalid credentials (inline), network error (banner)

### Register Screen (Multi-step)

```
Step 1: Name, Phone, Password
Step 2: Select Dark Store (single dropdown — zone is derived on backend)
Step 3: Weekly Income Band (preset brackets: ₹6K / ₹9K / ₹12K / ₹15K)
        → Submit → JWT returned → navigate to Home tab
```

Each step has a back button and a progress indicator (1/3, 2/3, 3/3).

Dark store selection is a single dropdown. Each dark store maps to a zone internally — the rider never sees "zone" as a separate concept. The backend resolves zone_id from dark_store_id.

---

## Home Tab (Dashboard)

The rider's landing screen. At a glance: am I covered, what's happening in my area, what's my balance.

### Layout

```
┌─────────────────────────────┐
│  Hi, {name}                 │
│  {dark_store_name}          │
├─────────────────────────────┤
│  ┌─────────────────────┐    │
│  │ DELIVERY PROGRESS    │   │
│  │ {n}/7 deliveries     │   │
│  │ ████████░░░░         │   │
│  │ {7-n} more to activate│  │
│  └─────────────────────┘    │
│  (above card only if < 7)   │
│                             │
│  ┌─────────────────────┐    │
│  │ ACTIVE POLICY        │   │
│  │ {plan} Plan          │   │
│  │ Tier: {worker_tier}  │   │
│  │ Expires: {date}      │   │
│  │ Eff. Cap: ₹{eff_cap} │  │
│  │ Remaining: ₹{rem}    │   │
│  └─────────────────────┘    │
│                             │
│  ┌─────────────────────┐    │
│  │ ZONE RISK            │   │
│  │ Current: {score} ({tier})│
│  │ ████████░░░░ {score}/100 │
│  │ {active signals}     │   │
│  └─────────────────────┘    │
│                             │
│  ┌─────────────────────┐    │
│  │ WALLET BALANCE       │   │
│  │ ₹{balance}           │   │
│  └─────────────────────┘    │
│                             │
│  RECENT ACTIVITY            │
│  {last 3 claim/payout items}│
└─────────────────────────────┘
```

### Cards

1. **Active Policy card** — plan name, expiry date, weekly cap, remaining payout allowance (weekly_cap - payouts_issued_this_week). If no active policy → card shows "No active plan — Get covered" as a tappable prompt to the Policy tab.

2. **Zone Risk card** — current composite risk score + tier label (none/tier1/tier2/full) + progress bar. Mini breakdown showing which signals are currently active (rain, flood, heat, etc.). Fetched on screen load (single API call), not polled.

3. **Wallet Balance card** — balance number. Tapping navigates to Wallet tab.

4. **Recent Activity** — last 3 items from claim history (filed, approved, rejected). Tapping navigates to Claims tab.

### Edge States

- No active policy → policy card becomes a CTA
- Policy expiring within 1 day → policy card shows "Expires tomorrow — Renew now" with accent styling

---

## Policy Tab

Two states depending on whether the rider has an active policy.

### State A — No Active Policy (Purchase Flow)

```
┌─────────────────────────────┐
│  Get Covered                │
│                             │
│  YOUR WEEKLY PREMIUM        │
│  ₹{total}/week              │
│  (dynamically calculated)   │
│                             │
│  PREMIUM BREAKDOWN          │
│  Risk premium:     ₹{base}  │
│  City factor:      ×{city}  │
│  Pool rebate:      −₹{reb}  │
│  ───────────────────────     │
│  This week:        ₹{total} │
│                             │
│  YOUR COVERAGE              │
│  Tier: {Regular/Low Activity}│
│  Weekly Cap: ₹{cap}         │
│  (= 20% of weekly income)  │
│                             │
│  DECLARE SHIFT SLOTS        │
│  Mon  [start - end]         │
│  Tue  [start - end]         │
│  Wed  [— add —]             │
│  Thu  [— add —]             │
│  Fri  [start - end]         │
│  Sat  [— add —]             │
│  Sun  [— add —]             │
│                             │
│  [ Buy Coverage — ₹{total} ]│
└─────────────────────────────┘
```

**Single plan:** There are no Lite/Standard/Plus tiers. Every rider gets the same plan — the premium is dynamically calculated each week using the actuarial formula, and the weekly cap is derived from the rider's declared income band (20% of weekly income). Activity-based tiering adjusts the cap: regular (≥ 3 active days) gets the full cap, low activity (< 3 days) gets 60%.

**Prerequisite:** Rider must have ≥ 7 total deliveries. If < 7, the purchase flow is replaced with: "Complete {7-n} more deliveries to buy coverage" message with a progress indicator.

**Flow:**
1. Premium breakdown auto-fetches on screen load (`GET /api/policies/premium`) — no plan selection needed. Internally calls AI `/calculate-premium` with actuarial formula (trigger_prob × avg_income_loss × days_exposed × city_factor − rebate)
2. Coverage section shows current worker tier and resulting weekly cap
3. Rider declares shift slots for the week — day-by-day time pickers (start time + end time per day, optional per day)
4. "Buy Coverage" button → `POST /api/policies/purchase` → creates policy + pool document (upsert) on backend
5. On success → screen transitions to Active Policy state

### State B — Active Policy

```
┌─────────────────────────────┐
│  Your Coverage              │
│  Active                     │
│  {week_start} – {week_end}  │
│                             │
│  Premium Paid: ₹{premium}  │
│  Tier: {worker_tier}        │
│  Weekly Cap: ₹{cap}         │
│  Payouts Used: ₹{used}     │
│  Remaining: ₹{remaining}   │
│                             │
│  YOUR SHIFTS                │
│  Mon  5PM - 11PM            │
│  Tue  5PM - 11PM            │
│  Wed  —                     │
│  ...                        │
│                             │
│  [ Renew for Next Week ]    │
└─────────────────────────────┘
```

Shows current coverage details, worker tier, and declared shifts (read-only after purchase). "Renew for Next Week" button opens the same purchase flow for the upcoming week (premium recalculated fresh).

---

## Claims Tab

Dual purpose: view claim history + file new claims via FAB.

### Claims List (Default View)

```
┌─────────────────────────────┐
│  My Claims                  │
│                             │
│  {list of claim cards}      │
│                             │
│  Each card:                 │
│  ┌─────────────────────┐    │
│  │ {status badge}       │    │
│  │ {trigger_type}       │    │
│  │ {date} — ₹{amount}  │    │
│  └─────────────────────┘    │
│                             │
│         [ + File Claim ] ← FAB
└─────────────────────────────┘
```

**Claim card contents:**
- Status badge: 🟡 Pending (yellow) | 🟢 Approved (green) | 🔴 Rejected (red)
- Trigger type name (e.g., "Heavy Rain", "Flood / Waterlogging")
- Date filed
- Amount: `₹{amount}` if resolved, `calculating...` if pending

Claims listed in reverse chronological order. Tapping a card opens Claim Detail screen.

**Empty state:** "No claims yet. File your first claim when a disruption affects your shift."

### Claim Detail Screen

```
┌─────────────────────────────┐
│  ← Back                     │
│                             │
│  {trigger_type}             │
│  Status: {status badge}     │
│                             │
│  Filed:    {date, time}     │
│  Resolved: {date, time}     │
│                             │
│  PAYOUT                     │
│  Eligible hours: {hours}    │
│  Amount: ₹{amount}         │
│                             │
│  VERIFICATION               │
│  {signal}: {value} (status) │
│  Zone risk score: {score}   │
│  Peer claims: {count} in zone│
│                             │
│  (if rejected:)             │
│  REASON                     │
│  {human-readable reason}    │
└─────────────────────────────┘
```

Shows full breakdown of what was checked, what values were found, and why the claim was approved or rejected. Verification section varies by trigger type — shows the relevant data points (rainfall_mm for rain, AQI value for heat/AQI, flood_signal for flood, etc.).

### File Claim Flow (FAB → Full-Screen)

**Screen 1 — Select Trigger Type**

```
┌─────────────────────────────┐
│  ← Cancel                   │
│                             │
│  What's disrupting your     │
│  shift?                     │
│                             │
│  ┌─────────────────────┐    │
│  │ 🌧 Heavy Rain        │    │
│  ├─────────────────────┤    │
│  │ 🌊 Flood/Waterlogging│    │
│  ├─────────────────────┤    │
│  │ 🏪 Dark Store Outage │    │
│  ├─────────────────────┤    │
│  │ 🚧 Zone Restriction  │    │
│  ├─────────────────────┤    │
│  │ 🌡 Extreme Heat/AQI  │    │
│  ├─────────────────────┤    │
│  │ ⚠️ Unsafe Area       │    │
│  └─────────────────────┘    │
└─────────────────────────────┘
```

Six trigger types displayed as a vertical list. Tapping one advances to the confirmation screen.

**Trigger type enum values:** `heavy_rain`, `flood`, `dispatch_outage`, `zone_restriction`, `extreme_heat`, `unsafe_area`

**Screen 2 — Confirm & Submit**

```
┌─────────────────────────────┐
│  ← Back                     │
│                             │
│  Confirm Claim              │
│                             │
│  Type: {trigger_type_label} │
│  Dark Store: {dark_store}   │
│  Shift: {shift_slot_today}  │
│  Time: {current_timestamp}  │
│                             │
│  Your claim will be verified│
│  against live data. You'll  │
│  be notified of the result. │
│                             │
│  [ Submit Claim ]           │
└─────────────────────────────┘
```

Auto-populated from the rider's profile and active policy. No manual input beyond the trigger type selection from Screen 1. Rider reviews and submits.

**Screen 3 — Submitted Confirmation**

```
┌─────────────────────────────┐
│                             │
│       ✓ Claim Filed         │
│                             │
│  We're verifying your       │
│  claim now. You'll receive  │
│  a notification when it's   │
│  resolved.                  │
│                             │
│  [ View My Claims ]         │
└─────────────────────────────┘
```

Transient confirmation screen. "View My Claims" navigates back to the Claims list where the new claim appears with pending status.

### Filing Guard Rails

| Condition | Behavior |
|---|---|
| No active policy | Blocks filing — shows "Get covered first" prompt linking to Policy tab |
| Coverage not active (< 7 deliveries) | Blocks filing — shows "Complete your deliveries to activate coverage" |
| More than 48 hours since last declared shift ended | Blocks filing — shows "Filing window expired — claims must be filed within 48 hours of your shift" |
| Duplicate trigger type within 30 min | Blocks filing — shows "You already filed a {type} claim at {time}" |

---

## Wallet Tab

```
┌─────────────────────────────┐
│  Wallet                     │
│                             │
│  ┌─────────────────────┐    │
│  │     ₹{balance}       │    │
│  │   Available Balance   │    │
│  └─────────────────────┘    │
│                             │
│  TRANSACTIONS               │
│  {reverse chronological}    │
│                             │
│  + ₹{amt}    Payout        │
│  {trigger_type} claim       │
│  {date, time}               │
│                             │
│  + ₹{amt}    Rebate        │
│  Pool surplus rebate        │
│  {date}                     │
│                             │
│  − ₹{amt}    Premium       │
│  {plan} plan purchase       │
│  {date}                     │
└─────────────────────────────┘
```

**Details:**
- Balance displayed prominently at top
- Transaction list in reverse chronological order
- Three transaction types with color coding:
  - `payout` — green (+), linked to a claim_id
  - `rebate` — green (+), pool surplus distribution
  - `premium` — red (−), policy purchase deduction
- Each entry: amount, type label, description, timestamp
- No withdrawal/cashout for Phase 2 — wallet is mock balance only

**Empty state:** "No transactions yet."

---

## Notifications

Push notifications are sent when a pending claim is resolved.

**Formats:**
- Approved: `"Claim approved — ₹{amount} credited for {trigger_type} disruption"`
- Rejected: `"Claim not verified — {reason_summary}"`

**Behavior:** Tapping a notification deep-links to the Claim Detail screen for that specific claim.

Push notification implementation approach (FCM vs local notifications) to be decided during implementation planning.

---

## Edge States Summary

| State | Screen | Behavior |
|---|---|---|
| No active policy | Home | Policy card becomes CTA: "No active plan — Get covered" → Policy tab |
| Deliveries < 7 | Home | Delivery Progress card: "{n}/7 deliveries — {7-n} more to activate" |
| Low activity (< 3 days) | Home | Policy card shows "Low Activity" tier badge, reduced effective cap |
| No active policy | Claims FAB | Blocks filing — "Get covered first" prompt |
| Coverage not active (< 7 del.) | Claims FAB | Blocks filing — "Complete your deliveries to activate coverage" |
| > 48hrs since shift ended | Claims FAB | Blocks filing — "Filing window expired — within 48 hours of shift" |
| Duplicate claim (30 min) | Claims FAB | Blocks filing — "You already filed a {type} claim at {time}" |
| Deliveries < 7 | Policy tab | Shows delivery progress instead of purchase flow |
| Network error | Any API call | Inline error banner: "Connection issue — try again" with retry button |
| Empty claims list | Claims tab | "No claims yet. File your first claim when a disruption affects your shift." |
| Empty transactions | Wallet tab | "No transactions yet." |
| Policy expiring | Home | Policy card: "Expires tomorrow — Renew now" with accent styling |
| Claim pending | Claims list | Yellow badge, "calculating..." for amount until resolved |

---

## Backend Implications

This design implies the following changes to the backend architecture described in [flow_claim.md](../../flow_claim.md) and the [Phase 2 design spec](2026-03-23-shiftsure-phase2-design.md):

1. **No cron engine for claim generation.** The 15-minute trigger cron is removed. Claims originate from rider action via a new `POST /api/claims/file` endpoint.

2. **New claim filing endpoint:**
   ```
   POST /api/claims/file
   Body: { trigger_type }
   Auth: JWT (worker)
   ```
   Worker ID, zone (via dark store), shift slots, and policy resolved server-side from auth context. Returns `{ claim_id, status: "pending_verification" }`.

3. **Async verification pipeline:** After claim creation, the backend runs the verification pipeline (fetch APIs, call AI `/risk-score`, call AI `/fraud-check`) asynchronously. Updates claim status to `approved` or `rejected` and sends push notification.

4. **New claim status:** `pending_verification` replaces `pending_fraud_check`. Full states: `pending_verification` → `approved` | `rejected`.

5. **Zone risk computed on-demand:** `GET /api/zones/risk` (or similar) fetches live data from OpenWeatherMap + mock feeds, calls AI `/risk-score`, and returns the current composite score. Called when the rider opens the Home screen. No cron needed — risk is computed fresh per request.

6. **Claim verification grouping:** Time-window clustering (30-min window, same trigger type + zone) for peer credibility + event-based grouping (existing verified claims boost new ones). Both feed into the graph intelligence layer.

7. **Dark store → zone mapping:** Registration only collects `dark_store_id`. Backend resolves `zone_id` from the dark store record.

8. **Unsafe Area trigger:** New mock endpoint `GET /mock/safety/:zone_id` returning `{ unsafe_signal: boolean }`. Same pattern as flood/dispatch mocks.

9. **Single plan, dynamic pricing:** No Lite/Standard/Plus tiers. Premium calculated per week using actuarial formula: `trigger_prob × avg_income_loss × days_exposed × city_factor − rebate`, clamped to ₹20–50 range. Weekly cap = 20% of rider's declared weekly income.

10. **Min 7 deliveries:** Coverage activates only after rider completes 7 deliveries. `total_deliveries` tracked on worker record.

11. **Activity-based tiering:** Workers with < 3 active days in 7 → `worker_tier: "low_activity"` — same premium, effective_weekly_cap = 60% of base weekly_cap.

12. **48-hour filing window:** Riders can file claims up to 48 hours after their declared shift ends (replaces "must be within shift hours"). Accommodates low-connectivity zones.

13. **BCR monitoring:** Admin dashboard shows BCR (total_claimed / total_collected), target 0.55–0.70.

14. **Loss ratio circuit breaker:** Admin zones page shows loss ratio per zone. > 85% → "Suspend enrollment" warning (display-only for Phase 2).

15. **Stress testing:** Admin page to simulate 14-day monsoon scenario across zones, projecting BCR, loss ratios, and pool depletion.

16. **AQI source:** OpenWeatherMap for Phase 2. Production path: CPCB (Central Pollution Control Board) for India-specific authoritative data.
