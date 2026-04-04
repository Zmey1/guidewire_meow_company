# ShiftSure True E2E Testing Guide

This document explains the new **True End-to-End (E2E) testing framework**. We have completely deprecated mock testing in favor of a full integration pipeline. This means the tests spin up both the **Node.js Backend** and the **Python AI Service**, execute calls over real HTTP, and interact directly with your **Live Firebase and Neo4j Databases**.

*Don't worry! The tests generate temporary users and zones prefixed with `e2e_`, and gracefully delete all test claims, wallets, and policies when the test concludes.*

---

## 1. Prerequisites (Authentication)

Because the tests bypass dummy layers and hit the live production/testing databases, your machine (or CI pipeline) must be authorized.

You need the following environment variables. The easiest way to provide these locally is by creating a `.env` file in the `backend/` directory:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_API_KEY=AIzaSy... (Your Firebase Client API Key)
NEO4J_URI=neo4j+s://...
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
```

**And crucially, the Google Application Credentials:**
You must have a Firebase Admin Service Account JSON file. 
Set the absolute path to this file as an environment variable in your terminal before running the tests:

**Windows (PowerShell):**
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\absolute\path\to\your\firebase-service-account.json"
```

**macOS/Linux:**
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/firebase-service-account.json"
```

---

## 2. How to Run the Tests Locally

To test the entire system from your local desktop, you need to spin up the servers and then run the Jest suite. 

### Step A: Terminal 1 (Python AI Engine)
```bash
cd ai
pip install -r requirements.txt
uvicorn main:app --port 8001
```

### Step B: Terminal 2 (Node.js Backend)
```bash
cd backend
npm install
node server.js
```

### Step C: Terminal 3 (Run the E2E Suite)
Ensure your `GOOGLE_APPLICATION_CREDENTIALS` logic is exported in this terminal session.
```bash
cd backend
npm test
```

> **What to expect:** You will see Jest connect to the Backend via Axios, make API calls for Policy Purchase, simulate an Admin weather trigger, evaluate payouts, establish the claims and wallet entries, and immediately prune the test data from Firebase.

---

## 3. How to Execute via GitHub Actions (CI/CD)

The repository has been equipped with `.github/workflows/test.yml`. The testing automatically runs on every Push or Pull Request targeting the `main` branch.

To ensure the automated GitHub runner doesn't fail with a missing Project ID credential error, you must supply your secrets to GitHub.

### Setting up GitHub Secrets

1. Navigate to your GitHub Repository.
2. Click **Settings -> Secrets and Variables -> Actions**.
3. Create new **Repository Secrets** based on your credentials:
   - `GCP_SERVICE_ACCOUNT_KEY`: Copy and paste the *entire* raw JSON content of your firebase service account file here.
   - `FIREBASE_PROJECT_ID`: Your project ID (e.g. `shiftsure-backend`).
   - `FIREBASE_API_KEY`: Your Firebase web API key.
   - `NEO4J_URI`: Your Neo4j connection string.
   - `NEO4J_USER`: `neo4j`
   - `NEO4J_PASSWORD`: Your database password.

Once these secrets are assigned, the next PR or Push will dynamically spin up ubuntu runners, inject the secrets, start the servers in the background, and perform a full system integration check before allowing a code merge!
