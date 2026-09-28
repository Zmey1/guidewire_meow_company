# ShiftSure Platform: Full Setup & Tester Guide

Repository: `https://github.com/Zmey1/guidewire_meow_company`

This guide covers local development and testing. For the Cloud Run / Firebase Hosting demo deployment, see [`deploy.md`](deploy.md).

---

## 1. Prerequisites
- **Flutter SDK**: [Install Flutter](https://docs.flutter.dev/get-started/install).
- **Node.js**: [Install Node.js (v18+)](https://nodejs.org/).
- **Python**: [Install Python (v3.9+)](https://www.python.org/).
- **Neo4j**: [Install Neo4j Desktop](https://neo4j.com/download/).

---

## 2. Firebase Configuration (Mandatory)

### Service Account (Backend)
1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Project Settings > Service Accounts > Generate new private key.
3.  Place the JSON file in `backend/` and rename it to `serviceAccountKey.json`. It is gitignored and excluded from Docker images — never commit it.

### Flutter Config
1.  In both `mobile/` and `admin/` folders, run:
    ```bash
    flutterfire configure --project=shiftsure-a34e9
    ```
2.  Ensure `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) are generated in the respective app directories.

### Firestore Indexes
Ensure the following composite index is enabled:
- **Collection**: `claims`
- **Fields**: `worker_id` (ASC), `trigger_type` (ASC), `created_at` (DESC)

---

## 3. Environment Headers (`.env`)

Copy `backend/.env.example` → `backend/.env` and `ai/.env.example` → `ai/.env`, then fill in the values. Key settings:

### Backend (`backend/.env`)
```env
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
FIREBASE_PROJECT_ID=shiftsure-a34e9
OWM_API_KEY=YOUR_FREE_WEATHER_KEY
AI_SERVICE_URL=http://localhost:8001
AI_SERVICE_TOKEN=same-value-as-ai/.env
CORS_ALLOWED_ORIGINS=http://localhost:5000
PAYOUT_MODE=simulated   # never set to razorpayx for demos — that moves real money
PORT=3000
```

### AI Engine (`ai/.env`)
```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=YOUR_PASSWORD
AI_SERVICE_TOKEN=same-value-as-backend/.env
```

### Demo accounts
`npm run seed` (in `backend/`) needs `SEED_ADMIN_PASSWORD`, `SEED_DEMO_PASSWORD` and `SEED_RIDER_PASSWORD` (≥12 chars each). There are no default passwords. Only run the seed against a project you own — it overwrites demo data.

---

## 4. API Endpoint

Release builds take the backend URL at compile time: `--dart-define=API_BASE_URL=https://<backend>/api`. Without it, the apps fall back to local defaults:
- **Android Emulator**: Connects to `10.0.2.2:3000`.
- **iOS Simulator / Web / Desktop**: Connects to `localhost:3000`.

### Physical Device Testing
Pass your machine's LAN IP at build time instead of editing code:
```bash
flutter run --dart-define=API_BASE_URL=http://YOUR_LAN_IP:3000/api
```

---

## 5. Running the Services

1.  **AI Engine**: 
    ```bash
    cd ai && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && uvicorn main:app --port 8001
    ```
2.  **Backend**:
    ```bash
    cd backend && npm install && npm start
    ```
3.  **Flutter Apps**:
    ```bash
    cd mobile && flutter run
    # or
    cd admin && flutter run -d chrome
    ```

---

## 6. Tests

```bash
cd backend && npm test          # hermetic unit tests (payout idempotency, fraud fail-safe, duplicate claims, withdrawals)
cd ai && pip install pytest && pytest -q
cd mobile && flutter test
cd admin && flutter test
```

`npm run test:e2e` is the **live** suite: it writes to real Firebase and needs running services. Never run it against the demo project without approval.
