# ShiftSure Test Walkthrough

This runbook separates three things that were previously mixed together:

- current automated API E2E
- manual UI acceptance on the rider app and admin app
- future UI automation work

## 1. What Exists Today

### 1.1 Automated tests that exist now

- Backend live E2E: `backend/tests/e2e/pipeline.live.test.js`
- Mobile Flutter test: `mobile/test/unit/api_service_test.dart`
- Admin Flutter test: `admin/test/unit/api_service_test.dart`

### 1.2 What those tests mean in practice

- The backend “E2E” suite is **not** Flutter UI E2E.
- It is a live integration test that drives the backend over HTTP and uses real Firebase/Firestore.
- The mobile and admin Flutter tests are currently placeholder discovery tests only.

### 1.3 What still requires manual checking

- rider UI on a real Android phone
- admin UI on web/desktop
- visual correctness
- seeded-user journeys
- device networking to local backend

---

## 2. Prerequisites

- Node.js `20+`
- Python `3.12+`
- Flutter stable
- Firebase project with Auth enabled
- Firebase Admin service account JSON
- Firebase Web API key
- Neo4j reachable from your machine
- Physical Android phone on the same LAN as your laptop for rider-device testing

---

## 3. Environment Setup

### 3.1 Backend env

From repo root:

```bash
cd backend
cp .env.example .env
```

`backend/.env` should contain:

```env
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
FIREBASE_PROJECT_ID=your-project-id
OWM_API_KEY=your-openweathermap-key
AI_SERVICE_URL=http://localhost:8001
PORT=3000
```

### 3.2 Firebase Admin credential

`backend/config/firebase.js` uses `applicationDefault()`, so an absolute path export is the safest option.

macOS/Linux:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/serviceAccountKey.json"
```

Windows PowerShell:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\absolute\path\to\serviceAccountKey.json"
```

### 3.3 Firebase Web API key

Required for backend E2E because the test exchanges Firebase ID tokens over REST:

```bash
export FIREBASE_API_KEY="your-firebase-web-api-key"
```

### 3.4 AI dependencies

From repo root:

```bash
cd ai
pip install -r requirements.txt
```

### 3.5 AI fraud / Neo4j env

For full graph-backed fraud behavior, create `ai/.env` with:

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-neo4j-password
```

Local development fallback:

- if Neo4j is not configured, the AI `fraud-check` endpoint now fails open with a fallback decision instead of returning `503`
- this keeps manual claim verification unblocked locally
- for real fraud-graph validation, you still need a working Neo4j instance and `ai/.env`

---

## 4. Authoritative Run Commands

Open 4 terminals if you want both automated tests and seeded manual UI checks.

### Terminal A — AI service

```bash
cd ai
uvicorn main:app --port 8001
```

### Terminal B — Backend service

```bash
cd backend
npm install
node server.js
```

Alternative:

```bash
cd backend
npm install
npm run dev
```

### Terminal C — Automated tests

Backend API E2E:

```bash
cd backend
npm test
```

Mobile placeholder Flutter test:

```bash
cd mobile
flutter test
```

Admin placeholder Flutter test:

```bash
cd admin
flutter test
```

### Terminal D — Seed demo users for manual UI acceptance

This is required for the rider/admin manual flows below.

`npm run seed` is now idempotent for seeded demo riders:

- existing seeded rider `policies` are deleted first
- existing seeded rider `claims` are deleted first
- existing seeded rider wallet `transactions` are deleted first
- then the historical demo timeline is recreated

```bash
cd backend
npm run seed
```

---

## 5. Sanity Checks Before Testing

Backend:

```bash
curl -s http://localhost:3000/health
```

AI:

```bash
curl -s http://localhost:8001/health
```

Both should return JSON with `status: "ok"`.

---

## 6. Automated Coverage

## 6.1 What the current backend E2E checks exactly

File: `backend/tests/e2e/pipeline.live.test.js`

The suite does the following:

1. Creates temporary Firebase Auth users:
   - `worker_e2e_<timestamp>@shiftsure.in`
   - `admin_e2e_<timestamp>@shiftsure.in`
2. Seeds temporary Firestore data:
   - one zone
   - one dark store
   - one pool
   - one rider worker doc
   - one admin worker doc
3. Verifies backend health is reachable.
4. Calls `GET /api/policies/premium?plan=standard` and checks a positive premium.
5. Calls `POST /api/policies/purchase` and checks policy purchase succeeds.
6. Calls `PATCH /api/admin/zones/:id/signals` to enable `flood_signal`.
7. Calls `POST /api/admin/trigger` with `trigger_type: "flood"` and checks the payout pipeline returns without a `500`.
8. Calls `GET /api/claims` and `GET /api/wallet` and verifies records exist.
9. If an approved claim exists, verifies claim shape includes:
   - `income_loss`
   - `scaled_payout`
   - `coverage_ratio`
   - `uncovered_loss`
10. Calls `POST /api/wallet/withdraw`:
   - invalid too-large withdrawal must return `400`
   - valid withdrawal must succeed and reduce balance
11. Deletes temporary claims, policies, pools, wallet records, zone docs, dark store docs, and Auth users.

## 6.2 What the current backend E2E does not check

- Flutter rider UI rendering
- Flutter admin UI rendering
- seeded demo users from `backend/scripts/seed.js`
- rider registration flow through the app UI
- manual claim filing through the app UI
- visual correctness on a phone
- real-device LAN connectivity
- browser/admin interaction flows

## 6.3 What the current Flutter tests check

- `mobile/flutter test`: placeholder test only, proves test discovery runs
- `admin/flutter test`: placeholder test only, proves test discovery runs

They are **not** feature tests today.

---

## 7. Physical Android Rider App Setup

## 7.1 Why a special setup is needed

The rider app now supports a runtime API base URL override through:

```text
--dart-define=API_BASE_URL=http://<HOST>:3000/api
```

Behavior:

- if `API_BASE_URL` is set, the app uses it
- if not set and the target is Android, it defaults to `http://10.0.2.2:3000/api`
- `10.0.2.2` works for the Android emulator only, not for a physical phone

## 7.2 Find your device and LAN IP

Device list:

```bash
flutter devices
```

Linux LAN IP example:

```bash
hostname -I
```

Use the IP that your phone can reach on the same Wi-Fi, for example `192.168.1.25`.

## 7.3 Run the rider app on a physical Android phone

From repo root:

```bash
cd mobile
flutter run --dart-define=API_BASE_URL=http://<YOUR_LAN_IP>:3000/api -d <DEVICE_ID>
```

Requirements:

- phone and laptop must be on the same LAN
- local firewall must allow inbound access to port `3000`
- backend must already be running locally

## 7.4 Run the rider app on Android emulator

From repo root:

```bash
cd mobile
flutter run
```

No `--dart-define` is required for the emulator.

---

## 8. Manual Rider Acceptance Flow

Use these seeded users from `backend/scripts/seed.js`.

Important:

- rider login uses **phone number + password**
- do **not** enter the generated Firebase email in the rider app

### 8.1 Demo Rider — active coverage/history smoke test

- Phone: `9000000001`
- Password: `Demo@1234`

Expected checks:

1. Login succeeds.
2. Home screen loads:
   - rider name
   - dark store name
   - active coverage card
   - zone risk card
   - wallet summary
   - recent claims
3. Claims tab shows seeded mixed statuses:
   - `pending_verification`
   - `approved`
   - `rejected`
4. Wallet tab shows transaction history including:
   - premium
   - payout
   - rebate
   - withdrawal
5. Wallet withdraw:
   - valid amount succeeds
   - success snackbar appears
   - balance decreases
   - transaction list updates
6. Wallet withdraw with amount above balance:
   - failure snackbar appears
   - balance does not change

### 8.2 Raj Kumar — eligible purchase + claim flow

- Phone: `9876543210`
- Password: `Rider@123`

Expected checks:

1. Login succeeds.
2. Home screen shows no active policy initially.
3. Policy flow allows purchase.
4. Purchase completes and coverage card appears.
5. Claims tab shows `File Claim` FAB.
6. Filing a claim submits successfully and creates a pending claim entry.

### 8.3 Meena Rao — ineligible rider flow

- Phone: `9876543213`
- Password: `Rider@123`

Expected checks:

1. Login succeeds.
2. Home/policy area shows rider is not eligible for coverage because deliveries are below threshold.
3. Purchase flow is blocked.
4. Claims tab does not expose claim filing for the rider.

### 8.4 Priya Suresh — partly-active tier behavior

- Phone: `9876543211`
- Password: `Rider@123`

Expected checks:

1. Login succeeds.
2. Policy purchase is allowed.
3. Tier label shows `PARTLY ACTIVE`.
4. Effective cap is reduced relative to the full active cap.

### 8.5 Demo Rider — claim should actually process end to end

Use this when you want to verify the async verification pipeline resolves a freshly filed claim instead of only checking pre-seeded history.

- Phone: `9000000001`
- Password: `Demo@1234`
- Trigger to select in app: `Flood/Waterlogging`

Why this case is reliable:

- Demo Rider already has an active current-week policy
- Demo Rider now uses a dedicated seeded demo zone for the current live/manual claim path
- that demo zone has `flood_signal = true` and `severe_flood_signal = true`
- the current demo policy uses all-day seeded shift slots for every day of the week, so the verification window overlaps regardless of current clock time
- the demo policy still has weekly cap remaining
- this path does not depend on live weather values

Important rule:

- claim approval is based on the recomputed live verification risk at filing time, not on old seeded history or a previously stored `current_risk_score`

Expected flow:

1. Login succeeds.
2. Open `Claims`.
3. Tap `File Claim`.
4. Select `Flood/Waterlogging`.
5. Submit the claim.
6. Immediate result:
   - app shows `Claim Submitted`
   - backend creates a new claim with `status = pending_verification`
7. Wait a few seconds and refresh Claims.
8. The new claim should resolve from `pending_verification` to a final state.
9. For the happy path, verify:
   - status becomes `approved`
   - `risk_score` is at least `40`
   - `payout_amount` is greater than `0`
   - `income_loss`, `scaled_payout`, `coverage_ratio`, and `uncovered_loss` are populated
10. Open `Wallet` and verify:
   - balance increases by the approved payout amount
   - a new `payout` transaction appears for that claim

API cross-check for the same test:

1. File the claim from the app.
2. Call `GET /api/claims` for Demo Rider.
3. Find the newest claim with `trigger_type = flood`.
4. Confirm:
   - it first appears as `pending_verification`
   - then later appears as `approved`
   - wallet reflects the payout after approval

If this case does not approve, the main things to check are:

- Neo4j/fraud service availability
- AI service availability
- duplicate filing within 30 minutes for the same trigger
- whether you already consumed the remaining weekly cap with earlier manual claims

If you see a rejected claim with `No covered shift overlap detected in the current disruption window`, that means you are exercising a non-demo policy or stale seed state. Rerun the seed and confirm Demo Rider is on the dedicated demo policy.
- duplicate filing within 30 minutes for the same trigger
- exhausted weekly cap on the current policy

---

## 9. Manual Admin Validation

Admin login uses **email + password**.

- Email: `admin@shiftsure.in`
- Password: `Admin@123`

Run admin locally on the same machine as the backend:

```bash
cd admin
flutter run -d chrome
```

Expected checks:

### 9.1 Dashboard

- login succeeds
- dashboard loads without errors
- loss ratio is shown as `claimed / collected`
- BCR is shown as `collected / claimed`
- stress test dialog opens and shows projected loss ratio, projected BCR, and reserve balance

### 9.2 Zones page

- zones list loads
- risk chips render
- enrollment state renders:
  - `ENROLLMENT OPEN`
  - `ENROLLMENT SUSPENDED`
- signal toggles work:
  - flood
  - severe flood
  - unsafe
  - restriction
- manual suspend/re-enable control works

### 9.3 Claims page

- claims list loads
- filters work
- approved/rejected/pending statuses render
- rejected claim override flow opens and credits wallet when used

---

## 10. Edge-Case Checklist

Some of these are directly checkable in UI now. Some require controlled state setup.

### 10.1 Directly checkable now

- wrong rider password shows login error
- invalid rider phone length shows validation error
- no backend connectivity on device:
  - stop backend or use wrong `API_BASE_URL`
  - app should fail requests instead of silently succeeding
- valid withdrawal updates wallet
- invalid too-large withdrawal fails without mutating balance
- pending claim lifecycle is visible in claims list
- partly-active tier label/cap renders correctly

### 10.2 Requires controlled setup or admin action

- suspended zone blocks new policy purchase:
  - suspend the rider’s zone from admin
  - then attempt rider purchase
- claim filing within allowed window:
  - use an eligible rider with current active policy and file immediately after purchase
- claim filing after allowed window:
  - requires time-shifted policy state or direct data prep because the UI does not expose time travel

---

## 11. Known Gaps

- There is no real Flutter UI automation coverage yet.
- Mobile and admin `flutter test` do not validate product behavior.
- Visual correctness still depends on manual checks on a real device and in admin web/desktop.
- Current backend E2E validates APIs and data side effects, not end-user UI journeys.

---

## 12. Future UI Automation Roadmap

Recommended next automation layer:

- add Flutter `integration_test` for:
  - rider login
  - home load
  - policy purchase
  - claim filing
  - wallet withdraw
  - admin zone suspend/re-enable

What `integration_test` is good for:

- functional UI flow automation
- app-to-backend wiring checks
- regression checks on user journeys

What `integration_test` does not replace:

- visual correctness on real devices
- layout/device-specific acceptance
- full manual product review

Optional later additions:

- golden tests for stable widgets
- seeded test fixtures dedicated to integration testing
- CI device/emulator execution once local flows are stable

---

## 13. Troubleshooting Matrix

| Symptom | Likely Cause | Fix |
|---|---|---|
| Backend E2E fails with Firebase auth/admin errors | Credential path or project mismatch | Re-check `GOOGLE_APPLICATION_CREDENTIALS` and `FIREBASE_PROJECT_ID` |
| E2E token exchange fails | Missing/invalid `FIREBASE_API_KEY` | Export a valid Firebase Web API key |
| Backend works on laptop but not phone | Phone is using emulator URL or cannot reach LAN host | Launch with `--dart-define=API_BASE_URL=http://<LAN_IP>:3000/api` and verify same Wi-Fi/firewall |
| Rider app cannot hit backend on phone | Port `3000` blocked or wrong LAN IP | Confirm backend health locally, confirm laptop IP, allow port through firewall |
| Fraud-related behavior fails | Neo4j unavailable | Verify `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` |
| Admin `flutter test` reports missing `assets/images/` | Declared asset directory missing | Ensure `admin/assets/images/` exists |
| `flutter test` fails because of toolchain state | Flutter SDK/cache issue | Run `flutter doctor`, `flutter pub get`, then rerun |

---

## 14. Quick Run Order

```bash
# 1) Start AI
cd ai && uvicorn main:app --port 8001

# 2) Start backend
cd backend && npm install && npm run dev

# 3) Run backend automated API E2E
cd backend && npm test

# 4) Run placeholder Flutter tests
cd mobile && flutter test
cd ../admin && flutter test

# 5) Seed demo users for manual UI checks
cd ../backend && npm run seed

# 6) Run rider app on physical Android
cd ../mobile && flutter run --dart-define=API_BASE_URL=http://<YOUR_LAN_IP>:3000/api -d <DEVICE_ID>

# 7) Run admin on the same laptop
cd ../admin && flutter run -d chrome
```

This is the current practical testing strategy for the repository.
