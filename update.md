# ShiftSure Deployment Update

**Date:** 2026-04-17
**Hackathon Deadline:** 2026-04-17

---

## ✅ Completed

### 1. Phase 3 — Task 1: Enhanced Fraud Scoring (AI Service)
- **`ai/models.py`** — Added `location_verified`, `gps_distance_km`, `weather_validated` to `FraudCheckRequest`; added `gps_fraud_signal`, `weather_fraud_signal`, `composite_fraud_score` to `FraudResult`
- **`ai/fraud.py`** — Enhanced `run_fraud_check()` with triple-layer scoring (Graph 40% + GPS 30% + Weather 30%). Composite thresholds: `<0.3` approve, `0.3–0.6` flag, `≥0.6` reject
- **`ai/main.py`** — Updated `/fraud-check` endpoint to pass new fields and include them in the fallback response
- All 8 composite-scoring test scenarios pass; fully backwards-compatible with existing callers

### 2. Neo4j AuraDB
- **Instance:** `shiftsure-fraud` (AuraDB Free tier)
- **URI:** `neo4j+s://97366ceb.databases.neo4j.io`
- Credentials saved locally at `ai/Neo4j-97366ceb-Created-2026-04-17.txt` (gitignored)

### 3. Render Deployments
- **AI Service:** https://shiftsure-ai.onrender.com — `/health` returns `{"status":"ok","service":"shiftsure-ai"}`
- **Backend Service:** https://guidewire-meow-company-s7uh.onrender.com — `/health` returns `{"status":"ok","service":"shiftsure-backend"}`
- Backend env vars set: `FIREBASE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `AI_SERVICE_URL`, `OWM_API_KEY`, `CORS_ALLOWED_ORIGINS`
- AI env vars set: `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`

### 4. Backend Firebase Credential Handling
- **`backend/config/firebase.js`** — Updated to support both `GOOGLE_APPLICATION_CREDENTIALS` (local file path) and `GOOGLE_APPLICATION_CREDENTIALS_JSON` (env-var for Render)

### 5. Admin Dashboard → Firebase Hosting
- **`admin/lib/services/api_service.dart`** — Updated to read `API_BASE_URL` via `--dart-define` (was hardcoded to localhost)
- Built with `--dart-define=API_BASE_URL=https://guidewire-meow-company-s7uh.onrender.com/api`
- **Live at:** https://shiftsure-a34e9.web.app
- Firestore rules + indexes deployed

### 6. `.gitignore` Hygiene
- Added `ai/Neo4j-*.txt`, `backend/serviceAccountKey.json`, `ai/.env`, `backend/.env`

---

## ✅ Mobile APK Built
- `mobile/build/app/outputs/flutter-apk/app-release.apk` (48 MB)
- Built with `--dart-define=API_BASE_URL=https://guidewire-meow-company-s7uh.onrender.com/api`

---

## ⏳ Remaining

### 1. Seed Production Firestore
Once backend is confirmed working end-to-end, seed demo data:
```bash
cd backend
FIREBASE_PROJECT_ID=shiftsure-a34e9 GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json npm run seed
```
Or trigger GitHub Actions workflow `Seed Demo Data` (requires GCP Workload Identity Federation setup — not currently configured).

### 2. Phase 3 — Tasks 2–13 (Not Yet Implemented)

**Backend (Tasks 2–7):**
- Task 2: GPS validation + weather cross-validation in `backend/services/verificationPipeline.js`
- Task 3: Payment Gateway service (`backend/services/paymentGateway.js`)
- Task 4: Integrate payout on claim approval + wallet withdrawal
- Task 5: `GET /api/workers/stats` endpoint
- Task 6: `GET /api/admin/forecast` and `GET /api/admin/trends` endpoints
- Task 7: Seed data updates (GPS coords, weather_history, payouts, upi_id on workers)

**Mobile (Tasks 8–10):**
- Task 8: GPS capture in claim submission (add `geolocator` package + Android permissions)
- Task 9: Home screen — Earnings Protected card, enhanced Coverage card, Zone Risk card
- Task 10: Wallet UPI ID input + payout status; claims "Instant Payout" badge

**Admin (Tasks 11–12):**
- Task 11: Dashboard — forecast card, loss ratio trend chart (`fl_chart`), pool health card, payouts card
- Task 12: Claims table — payment_status + gateway_reference_id columns

**Deployment (Task 13):**
- After Tasks 2–12, redeploy backend + AI to Render, rebuild admin web → Firebase, rebuild mobile APK

### 3. Smoke Tests After Each Deploy
- `curl /health` on both Render services
- File a claim on mobile → confirm GPS prompt appears
- Approved claim shows payout status progression
- Admin dashboard: forecast card loads with weather data
- Admin dashboard: loss-ratio trend chart renders
- Admin claims table: `payment_status` + `gateway_reference_id` columns appear

---

## 🔑 URLs & Key Info

| Component | URL / Value |
|---|---|
| AI Service | https://shiftsure-ai.onrender.com |
| Backend | https://guidewire-meow-company-s7uh.onrender.com |
| Admin Dashboard | https://shiftsure-a34e9.web.app |
| Firebase Project | `shiftsure-a34e9` |
| Neo4j AuraDB URI | `neo4j+s://97366ceb.databases.neo4j.io` |
| GCP Project (unused, no billing) | `shiftsure-a34e9` |
