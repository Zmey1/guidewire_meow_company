# ShiftSure Platform: Full Setup & Tester Guide

Repository: `https://github.com/Zmey1/guidewire_meow_company`

This guide ensures the entire platform (Mobile, Admin, Backend, and AI) is configured correctly for testing or deployment.

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
3.  Place the JSON file in `backend/` and rename it to `serviceAccountKey.json`.

### Flutter Config
1.  In both `mobile/` and `admin/` folders, run:
    ```bash
    flutterfire configure --project=YOUR_PROJECT_ID
    ```
2.  Ensure `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) are generated in the respective app directories.

### Firestore Indexes
Ensure the following composite index is enabled:
- **Collection**: `claims`
- **Fields**: `worker_id` (ASC), `trigger_type` (ASC), `created_at` (DESC)

---

## 3. Environment Headers (`.env`)

### Backend (`backend/.env`)
```env
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
OWM_API_KEY=YOUR_FREE_WEATHER_KEY
AI_SERVICE_URL=http://localhost:8001
PORT=3000
```

### AI Engine (`ai/.env`)
```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=YOUR_PASSWORD
```

---

## 4. API Endpoint (Automatic Detection)

The `api_service.dart` in both **Mobile** and **Admin** apps now automatically detects your environment:
- **Android Emulator**: Connects to `10.0.2.2:3000`.
- **iOS Simulator / Web / Desktop**: Connects to `localhost:3000`.

### Physical Device Testing
If testing on a physical phone, you must manually update `lib/services/api_service.dart` to your machine's LAN IP:
```dart
static String get baseUrl => 'http://YOUR_LAN_IP:3000/api';
```

---

## 5. Running the Services

1.  **AI Engine**: 
    ```bash
    cd ai && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && python app.py
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
