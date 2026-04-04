# ShiftSure — Testing Guide

> All curl commands use the demo rider token. Replace `$TOKEN` with the Firebase ID token you obtain from the login step.

---

## 1. Start Services

```bash
# Terminal 1 — AI Service
cd ai
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload

# Terminal 2 — Backend
cd backend
npm install
npm run dev          # nodemon server.js → http://localhost:3000

# Terminal 3 — Run seed (only once, or re-run to refresh)
cd backend
node scripts/seed.js
```

> **Note:** If you don't have Neo4j running, the `/fraud-check` call inside the claims pipeline will fail. The `triggerEngine.js` fails open gracefully (approves with a warning log). To fully disable fraud check, set `NEO4J_URI=` (empty) in `ai/.env`.

---

## 2. Get a Firebase ID Token (required for all API calls)

### Option A — REST API (no app needed)
```bash
curl -s -X POST \
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyCecB3jX0I6vyvin0yW1TI76UfvpvgKCHI" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo.rider@shiftsure.in","password":"Demo@1234","returnSecureToken":true}' \
  | grep -o '"idToken":"[^"]*"'
```
Copy the `idToken` value → set as `TOKEN`.

### Option B — Admin token
```bash
curl -s -X POST \
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyCecB3jX0I6vyvin0yW1TI76UfvpvgKCHI" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@shiftsure.in","password":"Admin@123","returnSecureToken":true}' \
  | grep -o '"idToken":"[^"]*"'
```

---

## 3. Test Dynamic Pricing (Premium Endpoint)

**Expected:** Different premium for each plan, with zone_addon and forecast_addon applied.

```bash
# Lite plan
curl -s "http://localhost:3000/api/policies/premium?plan=lite" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Standard plan (base ₹89)
curl -s "http://localhost:3000/api/policies/premium?plan=standard" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Plus plan (base ₹149)
curl -s "http://localhost:3000/api/policies/premium?plan=plus" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected response shape:**
```json
{
  "plan": "standard",
  "base_price": 89,
  "zone_addon": 4,          // 89 * 0.25 * 0.2
  "forecast_addon": 5,      // 89 * (60/100) * 0.1
  "rebate": 20,             // capped at ₹20 from pool surplus
  "final_premium": 78,      // 89 + 4 + 5 - 20
  "weekly_cap": 1000,
  "zone_name": "Koramangala",
  "forecast_risk_score": 60
}
```

**To verify dynamic pricing changes with zone risk:**
1. Call `PATCH /api/admin/zones/zone_koramangala/signals` with `flood_signal: true` (admin token)
2. Call `GET /api/zones/risk` — this updates `current_risk_score` in Firestore
3. Call `GET /api/policies/premium?plan=standard` again — `forecast_addon` should increase

---

## 4. Test Policy Purchase

```bash
# Buy standard plan with week-long shifts
curl -s -X POST "http://localhost:3000/api/policies/purchase" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan": "standard",
    "premium_paid": 78,
    "shift_slots": [
      {"day": "mon", "start": "17:00", "end": "23:00"},
      {"day": "tue", "start": "17:00", "end": "23:00"},
      {"day": "wed", "start": "17:00", "end": "23:00"},
      {"day": "thu", "start": "17:00", "end": "23:00"},
      {"day": "fri", "start": "17:00", "end": "23:00"},
      {"day": "sat", "start": "12:00", "end": "22:00"},
      {"day": "sun", "start": "12:00", "end": "22:00"}
    ]
  }' | jq .
```

> If the demo rider already has an active policy (`policy_demo_current`), you'll get 409. Either delete it in Firestore console or use a different rider account.

---

## 5. Test Active Policy + Worker Profile

```bash
# Worker profile with zone
curl -s "http://localhost:3000/api/workers/me" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Current policy
curl -s "http://localhost:3000/api/policies/current" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## 6. Test Claims History

```bash
# All claims for demo rider (30+ days seeded)
curl -s "http://localhost:3000/api/claims" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected:** 5--10 claims across 5 weeks — mix of `approved` and `rejected`.

---

## 7. Test Wallet

```bash
curl -s "http://localhost:3000/api/wallet" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected:** balance > 0, transactions array with `payout` and `premium` entries spanning past 5 weeks.

---

## 8. Test Zone Risk Score

```bash
curl -s "http://localhost:3000/api/zones/risk" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

This calls **OpenWeatherMap live** for Koramangala + AI /risk-score, updates Firestore, and returns the breakdown. If you see `0` for all weather signals, your OWM key or network may be throttled — the backend falls back gracefully.

---

## 9. Test Manual Trigger (Admin — instant payout pipeline)

```bash
# Set $ADMIN_TOKEN from step 2 Option B

# Simulate heavy rain in Koramangala
curl -s -X POST "http://localhost:3000/api/admin/trigger" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"zone_id": "zone_koramangala", "trigger_type": "heavy_rain", "severity": "high"}' | jq .
```

**Expected response:**
```json
{
  "zone_id": "zone_koramangala",
  "trigger_type": "heavy_rain",
  "risk_score": 60,
  "tier": "tier2",
  "payouts": [
    { "worker_id": "...", "worker_name": "Demo Rider", "payout_amount": 420, "eligible_hours": 3.5 }
  ],
  "skipped": [],
  "total_paid": 420,
  "message": "Pipeline complete — ₹420 paid to 1 riders"
}
```

After this call:
- Check `GET /api/claims` → new `approved` claim appears
- Check `GET /api/wallet` → balance increased by payout amount

**Test other trigger types:**
```bash
# Flood
curl -s -X POST "http://localhost:3000/api/admin/trigger" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"zone_id": "zone_koramangala", "trigger_type": "flood", "severity": "high"}' | jq .

# Dispatch outage (Indiranagar)
curl -s -X POST "http://localhost:3000/api/admin/trigger" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"zone_id": "zone_indiranagar", "trigger_type": "dispatch_outage"}' | jq .

# Zone restriction
curl -s -X POST "http://localhost:3000/api/admin/trigger" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"zone_id": "zone_koramangala", "trigger_type": "zone_restriction"}' | jq .
```

---

## 10. Test Admin Dashboard Endpoints

```bash
# Dashboard stats
curl -s "http://localhost:3000/api/admin/dashboard" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

# All claims (filterable)
curl -s "http://localhost:3000/api/admin/claims?zone_id=zone_koramangala" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

# Pools health
curl -s "http://localhost:3000/api/admin/pools" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

# All zones with active rider count
curl -s "http://localhost:3000/api/admin/zones" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
```

---

## 11. Test Flood Signal Toggle (mock state via admin)

```bash
# Toggle flood on in Koramangala zone
curl -s -X PATCH "http://localhost:3000/api/admin/zones/zone_koramangala/signals" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"flood_signal": true}' | jq .

# Now run risk score — should spike
curl -s "http://localhost:3000/api/zones/risk" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Reset
curl -s -X PATCH "http://localhost:3000/api/admin/zones/zone_koramangala/signals" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"flood_signal": false}' | jq .
```

---

## 12. Test from Mobile App (Flutter)

1. **Launch app** → login with `demo.rider@shiftsure.in` / `Demo@1234`
2. **Home screen** should show:
   - "Hi, Demo 👋" with dark store name
   - Active policy card: Standard plan, ₹1000 cap, ₹340 used
   - Recent activity: `heavy_rain` approved claim
3. **Claims tab** → 7 claims (5 historical + 2 current week)
4. **Wallet tab** → balance + transactions list
5. **Policy tab** → call `/api/policies/premium?plan=standard` → see breakdown

> Make sure `mobile/lib/services/api_service.dart` has correct `baseUrl` — replace `192.168.1.28` with your machine's LAN IP if testing on physical device.

---

## 13. Test from Admin Web App (Flutter Web)

1. **Open admin web app** → login with `admin@shiftsure.in` / `Admin@123`
2. **Dashboard** → shows: 5 active pools, riders insured, total payouts, reserve level
3. **Zones page** → 5 zones with risk scores, "Simulate Disruption" button
4. **Click "Simulate Disruption"** on Koramangala → select `heavy_rain` + `high` → see payout summary
5. **Claims page** → filter by zone/trigger type → see all historical + new claims

---

## 14. Verify Weekly Cap Enforcement

Run the admin trigger 3 times quickly for the same rider:
```bash
# Each call should reduce remaining cap by ~₹340
curl -s -X POST "http://localhost:3000/api/admin/trigger" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"zone_id": "zone_koramangala", "trigger_type": "heavy_rain"}' | jq .payout_amount
```

After the 3rd call (once `payouts_issued_this_week >= weekly_cap`), the worker should appear in `skipped` with `"Weekly cap reached"`.

---

## 15. Verify Ineligible Rider (< 7 deliveries)

```bash
# Login as Meena Rao (only 3 deliveries)
# Get token for meena.r@shiftsure.in / Rider@123
curl -s -X POST "http://localhost:3000/api/policies/purchase" \
  -H "Authorization: Bearer $MEENA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plan":"standard","premium_paid":89,"shift_slots":[{"day":"mon","start":"17:00","end":"23:00"}]}' | jq .
# Expected: 400 — "Complete 7 deliveries to be eligible for coverage"
```

---

## Credentials Summary

| Account | Email | Password | Role |
|---|---|---|---|
| Demo Rider | demo.rider@shiftsure.in | Demo@1234 | rider |
| Admin | admin@shiftsure.in | Admin@123 | admin |
| Raj Kumar | raj.kumar@shiftsure.in | Rider@123 | rider |
| Arjun Verma | arjun.v@shiftsure.in | Rider@123 | rider |
| Meena Rao (ineligible) | meena.r@shiftsure.in | Rider@123 | rider |

## Firebase API Key (for token fetch)
```
AIzaSyCecB3jX0I6vyvin0yW1TI76UfvpvgKCHI
```
