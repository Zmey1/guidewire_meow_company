# ShiftSure Hackathon Cloud Run Deployment Guide

This is the canonical deployment runbook for the hackathon/demo version of `Zmey1/guidewire_meow_company`.

The deployment target is intentionally lean:

- Firebase project: `shiftsure-a34e9`
- Region: `asia-south1`
- `backend`: Google Cloud Run
- `ai`: Google Cloud Run
- `admin`: Firebase Hosting
- `mobile`: signed Android APK direct install
- Data/Auth: Firebase Auth + Firestore on Firebase Spark
- Fraud graph: Neo4j Aura Free
- Weather source: OpenWeatherMap
- CI/CD: GitHub Actions + Google Workload Identity Federation

Important cost note:

- `Cloud Run` and `Artifact Registry` still require an active Google Cloud billing account, even if actual monthly charges stay at `$0` under free-tier usage.
- Official references:
  - [Google Cloud Free Tier](https://cloud.google.com/free/docs/free-cloud-features)
  - [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing)
  - [Firebase pricing](https://firebase.google.com/pricing)
  - [Neo4j pricing](https://neo4j.com/pricing/)

## 1. Target Architecture

`backend`
- Node.js Express API on public Cloud Run.
- Uses Firebase Admin SDK through the attached Cloud Run service account.
- Reads `FIREBASE_PROJECT_ID`, `AI_SERVICE_URL`, `OWM_API_KEY`, and `CORS_ALLOWED_ORIGINS` from env vars.

`ai`
- FastAPI service on public Cloud Run.
- Reads `NEO4J_URI`, `NEO4J_USER`, and `NEO4J_PASSWORD` from env vars.
- Uses Neo4j Aura Free for graph-backed fraud checks.

`admin`
- Flutter web app deployed to Firebase Hosting.
- Uses the generated Firebase web config already in the repo.
- Must be built with `--dart-define=API_BASE_URL=https://<backend-url>/api`.

`mobile`
- Flutter Android app distributed as a signed APK artifact.
- No Google Play setup is required for the hackathon version.
- Must be built with `--dart-define=API_BASE_URL=https://<backend-url>/api`.

## 2. Cost-Control Defaults

Use these defaults for both Cloud Run services:

- `min-instances=0`
- `max-instances=1`
- `cpu=1`
- `memory=512Mi`
- public URL
- one environment only: production/demo

Keep Artifact Registry usage low:

- store backend and AI images in one repo: `shiftsure`
- retain only the latest 2 image versions for each service after every deploy
- avoid per-commit image buildup beyond the demo window

For the hackathon path:

- do not use Secret Manager
- do not use Google Play Internal Testing
- do not create staging

## 3. Required Runtime Config

`backend`
- `PORT=8080`
- `FIREBASE_PROJECT_ID=shiftsure-a34e9`
- `AI_SERVICE_URL=https://<ai-cloud-run-url>`
- `OWM_API_KEY=<owm-key>`
- `CORS_ALLOWED_ORIGINS=https://shiftsure-a34e9.web.app,https://shiftsure-a34e9.firebaseapp.com,http://localhost:3000`

`ai`
- `PORT=8080`
- `NEO4J_URI=<aura-free-uri>`
- `NEO4J_USER=<neo4j-user>`
- `NEO4J_PASSWORD=<neo4j-password>`

`Flutter compile-time`
- `API_BASE_URL=https://<backend-cloud-run-url>/api`

`GitHub Variables`
- `GCP_PROJECT_ID=shiftsure-a34e9`
- `GCP_REGION=asia-south1`
- `ARTIFACT_REGISTRY_REPO=shiftsure`
- `CLOUD_RUN_BACKEND_SERVICE=shiftsure-backend`
- `CLOUD_RUN_AI_SERVICE=shiftsure-ai`

`GitHub Secrets`
- `GCP_WIF_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`
- `OWM_API_KEY`
- `NEO4J_URI`
- `NEO4J_USER`
- `NEO4J_PASSWORD`
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_STORE_PASSWORD`

## 4. One-Time Cloud Setup

### 4.1 Enable required GCP/Firebase services

```bash
gcloud config set project shiftsure-a34e9

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  firestore.googleapis.com \
  firebase.googleapis.com \
  identitytoolkit.googleapis.com
```

### 4.2 Create Artifact Registry

```bash
gcloud artifacts repositories create shiftsure \
  --repository-format=docker \
  --location=asia-south1 \
  --description="ShiftSure hackathon containers"
```

### 4.3 Create service accounts

```bash
gcloud iam service-accounts create shiftsure-backend-runtime \
  --display-name="ShiftSure Backend Runtime"

gcloud iam service-accounts create shiftsure-ai-runtime \
  --display-name="ShiftSure AI Runtime"

gcloud iam service-accounts create shiftsure-github-deployer \
  --display-name="ShiftSure GitHub Deployer"
```

Grant these roles:

`shiftsure-backend-runtime`
- `roles/datastore.user`

`shiftsure-ai-runtime`
- no extra GCP roles required for the hackathon setup

`shiftsure-github-deployer`
- `roles/run.admin`
- `roles/artifactregistry.writer`
- `roles/iam.serviceAccountUser`
- `roles/editor`

The `editor` grant is intentionally speed-first for the hackathon. Tighten it later if this project moves beyond demo use.

### 4.4 Configure GitHub OIDC

1. Create a Workload Identity Pool and GitHub OIDC provider.
2. Allow the GitHub repo to impersonate `shiftsure-github-deployer@shiftsure-a34e9.iam.gserviceaccount.com`.
3. Save these in GitHub Secrets:
   - `GCP_WIF_PROVIDER`
   - `GCP_DEPLOY_SERVICE_ACCOUNT`

### 4.5 Configure Firebase

1. Confirm Firestore and Authentication are enabled in `shiftsure-a34e9`.
2. Add these admin Hosting domains to Firebase Auth authorized domains before first admin login:
   - `shiftsure-a34e9.web.app`
   - `shiftsure-a34e9.firebaseapp.com`
3. Keep the root `.firebaserc` default project mapped to `shiftsure-a34e9`.

### 4.6 Configure Neo4j Aura Free

1. Create a free AuraDB instance.
2. Capture:
   - `NEO4J_URI`
   - `NEO4J_USER`
   - `NEO4J_PASSWORD`
3. Add them as GitHub Secrets.

### 4.7 Configure Android signing

1. Create an Android upload/signing keystore.
2. Base64-encode it and save it as `ANDROID_KEYSTORE_BASE64`.
3. Save:
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`
   - `ANDROID_STORE_PASSWORD`
4. The workflow reconstructs `mobile/android/key.properties` at build time.

## 5. Repo And Workflow Behavior

### 5.1 Deploy workflow

`.github/workflows/deploy-prod.yml` should do all of this:

1. authenticate to GCP via OIDC
2. build and push the AI image
3. deploy AI to Cloud Run with:
   - public ingress
   - `PORT=8080`
   - direct env vars for `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`
   - `min-instances=0`
   - `max-instances=1`
   - `cpu=1`
   - `memory=512Mi`
4. build and push the backend image
5. deploy backend to Cloud Run with:
   - public ingress
   - `PORT=8080`
   - `FIREBASE_PROJECT_ID`
   - `AI_SERVICE_URL`
   - `OWM_API_KEY`
   - `CORS_ALLOWED_ORIGINS`
   - `min-instances=0`
   - `max-instances=1`
   - `cpu=1`
   - `memory=512Mi`
6. build the admin web app with `API_BASE_URL`
7. deploy Firebase Hosting plus Firestore rules/indexes
8. run `/health` checks for AI and backend
9. delete old Artifact Registry image versions, keeping only the latest 2 for `shiftsure-ai` and `shiftsure-backend`

### 5.2 Android workflow

`.github/workflows/build-android-release.yml` should:

1. rebuild the keystore files from GitHub Secrets
2. build a signed APK, not an AAB
3. use `API_BASE_URL` as a required workflow input
4. upload the final APK as a workflow artifact

Release command:

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://<backend-url>/api
```

### 5.3 Demo seed workflow

`.github/workflows/seed-demo-data.yml` stays manual-only.

Use it:
- after backend deploy
- only when demo accounts/data are needed

Do not auto-run it as part of deploy.

## 6. Deployment Order

For the live hackathon environment:

1. ensure `main` is green
2. run `Deploy Production`
3. verify deployed AI `/health`
4. verify deployed backend `/health`
5. open the admin Hosting site and verify login
6. run `Seed Demo Data` if demo users are needed
7. run `Build Android Release`
8. download the APK artifact and install it directly on demo devices

## 7. Smoke Checks

### 7.1 Infrastructure

```bash
curl -s https://<ai-url>/health
curl -s https://<backend-url>/health
```

Confirm:
- both return `200`
- backend logs show successful calls to the AI URL

### 7.2 Admin

Verify on `https://shiftsure-a34e9.web.app` or the Firebase Hosting site:

- Firebase admin login works
- Dashboard loads
- Zones loads
- Claims loads
- admin-triggered payout still works

### 7.3 Backend functional smoke

After demo data is seeded:

- demo rider login works
- `/api/workers/me` works
- `/api/policies/current` works
- `/api/claims` works
- `/api/wallet` works
- `/api/zones/risk` works
- claim filing goes `pending_verification -> resolved`
- withdrawal success and insufficient-balance behavior still work

### 7.4 Android demo smoke

After installing the signed APK:

- login works
- Home loads
- Claims loads
- Wallet loads
- filing a claim works end to end
- bad credentials show readable errors
- backend connectivity failures show readable errors

## 8. Rollback

### 8.1 Cloud Run

Roll back traffic to the previous revision:

```bash
gcloud run revisions list --service shiftsure-backend --region asia-south1
gcloud run services update-traffic shiftsure-backend \
  --region asia-south1 \
  --to-revisions <PREVIOUS_REVISION>=100
```

Repeat for `shiftsure-ai`.

### 8.2 Firebase Hosting

Roll back to the previous Hosting release:

```bash
firebase hosting:releases:list
firebase hosting:clone <SITE_ID>:<OLD_VERSION_ID> <SITE_ID>:LIVE
```

### 8.3 APK

Keep the previous signed APK artifact available.

If the latest APK is bad:
- reinstall the previous APK on demo devices
- keep backend/admin revisions compatible

Do not rerun seed during rollback.

## 9. Defaults For This Hackathon

- one live environment only
- no staging
- Firebase Spark for Auth, Firestore, and Hosting
- Cloud Run for backend and AI
- Neo4j Aura Free
- signed APK direct install instead of Google Play
- public Cloud Run URLs are acceptable
- GitHub Actions is the primary deployment path
