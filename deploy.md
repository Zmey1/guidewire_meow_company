# ShiftSure Demo Deployment Guide (5-user private demo)

This is the canonical deployment runbook for the demo version of `Zmey1/guidewire_meow_company`.

- Firebase / GCP project: **`shiftsure-a34e9`** (the original project, project number `67264024586`). `shiftsure1` was a temporary stand-in while the original hit free-tier limits — do not deploy to it.
- Region: `asia-south1`
- `backend` (Node/Express) and `ai` (FastAPI): Google Cloud Run
- `admin` (Flutter web): Firebase Hosting
- `mobile` (Flutter Android): APK, direct install — not part of this deployment
- Data/Auth: Firebase Auth + Firestore
- Fraud graph: Neo4j Aura Free
- Weather: OpenWeatherMap
- CI/CD: GitHub Actions + Workload Identity Federation

The deploy and seed workflows refuse to run if `GCP_PROJECT_ID` differs from the `.firebaserc` default project.

## 1. Safety defaults

- **Payouts are simulated.** `PAYOUT_MODE=simulated` (the default and what the deploy workflow sets) credits in-app wallets only. Withdrawals are recorded as simulated; RazorpayX is never called, even if RazorpayX keys are present. Real payouts require `PAYOUT_MODE=razorpayx` **and** RazorpayX keys — do not enable this for the demo.
- **Payouts are idempotent.** Every claim payout (rider-filed, admin-triggered, admin override) goes through `backend/services/payoutService.js`: one Firestore transaction updates claim status, weekly cap, wallet (created if missing), ledger entry `payout_<claimId>` and pool. A claim can never be paid twice.
- **Fraud check fails safe.** If the AI service or Neo4j is unavailable, claims go to `pending_review` (no payout) instead of being approved or rejected. Admins resolve them via *Override* in the admin Claims screen.
- **AI service is private by token.** Its Cloud Run URL is public, but every endpoint except `/health` requires the `X-Internal-Token` header matching `AI_SERVICE_TOKEN`. The backend sends it automatically.
- **CORS** allows only the Hosting domains (`https://shiftsure-a34e9.web.app`, `https://shiftsure-a34e9.firebaseapp.com`). The Android app is unaffected by CORS.

## 2. Claim verification on Cloud Run (limitation)

Cloud Run only gives an instance CPU while a request is in flight. Claim verification therefore runs **inside** the `POST /api/claims/file` request: the response returns once the claim is `approved`, `rejected` or `pending_review` (typically a few seconds; longer on a cold start).

Limitations (acceptable for 5 users):

- Not a durable queue. If the instance crashes or is replaced mid-request, the claim stays in `pending_verification`. Admins can see it on the Claims screen. Re-filing within 30 minutes is blocked as a duplicate, so the fix is to wait out the window or approve it manually in Firestore.
- With `min-instances=0`, the first request after idle pays a cold start (backend + AI + Neo4j Aura wake-up). Warm the services before a demo (see §7).
- Neo4j Aura Free pauses after inactivity. While paused, fraud checks fail safe to `pending_review`. Resume the instance in the Aura console before the demo.

If you need faster responses and no cold starts, set `--min-instances 1` on the backend. This is **not free** — one always-on instance is billed continuously.

## 3. Cost

| Item | Expected cost for a 5-user demo |
|---|---|
| Cloud Run (2 services, min 0, max 1, CPU throttled) | $0 within the free tier; **billing account required** |
| Artifact Registry (2 images × 2 versions kept) | ~$0 (0.5 GB free); billing account required |
| Firebase Auth / Firestore / Hosting | $0 on Spark limits at this scale |
| Neo4j Aura Free | $0 |
| OpenWeatherMap free tier | $0 |
| `min-instances=1` on backend (optional) | Roughly $10–15/month per always-on instance — verify in the GCP pricing calculator |

Set a GCP budget alert (e.g. $5) on the billing account before the first deploy.

## 4. Configuration

### Runtime env (set by `deploy-prod.yml` — do not set `PORT`; Cloud Run reserves it)

`backend`: `FIREBASE_PROJECT_ID`, `AI_SERVICE_URL`, `AI_SERVICE_TOKEN`, `OWM_API_KEY`, `CORS_ALLOWED_ORIGINS`, `PAYOUT_MODE=simulated`, `NODE_ENV=production`

`ai`: `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `AI_SERVICE_TOKEN`

Flutter compile time: `API_BASE_URL=https://<backend-cloud-run-url>/api`

### GitHub Variables (Settings → Secrets and variables → Actions → Variables)

- `GCP_PROJECT_ID=shiftsure-a34e9`
- `GCP_REGION=asia-south1` (optional, default)
- `ARTIFACT_REGISTRY_REPO=shiftsure` (optional, default)
- `CLOUD_RUN_BACKEND_SERVICE=shiftsure-backend`, `CLOUD_RUN_AI_SERVICE=shiftsure-ai` (optional, defaults)

### GitHub Secrets (put them on the `production` environment)

| Secret | Used by | Notes |
|---|---|---|
| `GCP_WIF_PROVIDER` | deploy, seed | `projects/<num>/locations/global/workloadIdentityPools/<pool>/providers/<provider>` |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | deploy, seed | `shiftsure-github-deployer@shiftsure-a34e9.iam.gserviceaccount.com` |
| `AI_SERVICE_TOKEN` | deploy | random ≥32 chars, e.g. `openssl rand -hex 32` |
| `OWM_API_KEY` | deploy | **use a newly issued key** — the old one was committed to git |
| `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` | deploy | from the Aura console |
| `SEED_ADMIN_PASSWORD`, `SEED_DEMO_PASSWORD`, `SEED_RIDER_PASSWORD` | seed only (not needed — do not seed `shiftsure-a34e9`) | ≥12 chars each; seed refuses shorter ones and rotates existing demo users to these |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `ANDROID_STORE_PASSWORD` | Android build | see §5.6 |

Never commit service-account JSON, `.env` files, keystores or Neo4j credential exports. `.gitignore` and both `.dockerignore` files exclude them.

## 5. One-time setup (run by a project owner; needs `gcloud` and `firebase` CLIs)

### 5.1 Enable services

```bash
gcloud config set project shiftsure-a34e9

gcloud services enable \
  run.googleapis.com artifactregistry.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com firestore.googleapis.com \
  firebase.googleapis.com identitytoolkit.googleapis.com firebasehosting.googleapis.com
```

### 5.2 Artifact Registry

```bash
gcloud artifacts repositories create shiftsure \
  --repository-format=docker --location=asia-south1 \
  --description="ShiftSure demo containers"
```

### 5.3 Service accounts

```bash
gcloud iam service-accounts create shiftsure-backend-runtime --display-name="ShiftSure Backend Runtime"
gcloud iam service-accounts create shiftsure-ai-runtime      --display-name="ShiftSure AI Runtime"
gcloud iam service-accounts create shiftsure-github-deployer --display-name="ShiftSure GitHub Deployer"

P=shiftsure-a34e9
gcloud projects add-iam-policy-binding $P --member="serviceAccount:shiftsure-backend-runtime@$P.iam.gserviceaccount.com" --role=roles/datastore.user
for r in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser roles/editor; do
  gcloud projects add-iam-policy-binding $P --member="serviceAccount:shiftsure-github-deployer@$P.iam.gserviceaccount.com" --role=$r
done
```

`shiftsure-ai-runtime` needs no roles. `roles/editor` on the deployer is speed-first for the demo (it covers Hosting, Firestore rules and Firebase Auth user creation for the seed). Tighten it after the demo.

### 5.4 GitHub OIDC (Workload Identity Federation)

```bash
P=shiftsure-a34e9; REPO=Zmey1/guidewire_meow_company
PN=$(gcloud projects describe $P --format='value(projectNumber)')
gcloud iam workload-identity-pools create github --location=global
gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='$REPO'"
gcloud iam service-accounts add-iam-policy-binding shiftsure-github-deployer@$P.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PN/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
echo "GCP_WIF_PROVIDER=projects/$PN/locations/global/workloadIdentityPools/github/providers/github"
```

### 5.5 Firebase

1. Firestore (native mode) and Authentication → Email/Password are enabled in `shiftsure-a34e9`.
2. Authentication → Settings → Authorized domains includes `shiftsure-a34e9.web.app` and `shiftsure-a34e9.firebaseapp.com` (verified present).
3. `.firebaserc`, `admin/lib/firebase_options.dart`, `mobile/lib/firebase_options.dart`, `mobile/android/app/google-services.json` and both `firebase.json` files all point at `shiftsure-a34e9` (every API key verified to resolve to project `67264024586`) — keep it that way.
4. The Spark plan's daily Firestore quotas are what forced the earlier move to `shiftsure1`. Five users are well within them, but avoid re-running the seed or the live E2E suite repeatedly on demo day. Upgrading to Blaze (pay-as-you-go, with a budget alert) removes the hard cap.

### 5.6 Android signing (current state)

`mobile/android/app/build.gradle.kts` signs `release` builds with the **debug** config; the keystore secrets restored by the workflow are not wired into Gradle yet. For a private sideloaded demo this works. Each CI runner has a different debug key, though, so testers must uninstall before installing an APK built on a different machine or run. To ship a stable signature, add a `release` signingConfig that reads `key.properties`.

## 6. Deploy sequence

Everything below is manual (`workflow_dispatch`); nothing deploys on push.

1. Merge the reviewed deployment PR into `main`. The workflows build from the pushed commit, not from local files.
2. Check that the **ShiftSure Tests** run on `main` is green (backend unit + AI pytest + Flutter).
3. Resume the Neo4j Aura instance if it is paused.
4. Actions → **Deploy Production** → Run workflow. It deploys only the AI service, the backend and the admin web dashboard. It:
   - verifies the target project matches `.firebaserc` and that every required secret is set,
   - builds and deploys `ai`, then builds and deploys `backend` (Cloud Run),
   - builds `admin` with the backend URL and deploys Firebase Hosting plus Firestore rules and indexes. This touches no Firestore data. The rules deny all client access, which is safe because neither app reads Firestore directly. Index deploys only add indexes; non-interactive mode never deletes existing ones,
   - checks both `/health` endpoints and that the AI service returns 401 without a token,
   - trims old images.
   Copy the Backend URL from the job summary.
5. **Do not run the seed on `shiftsure-a34e9`.** It deletes and overwrites existing demo data. To retire the previously published demo passwords, rotate them on the existing accounts instead. This changes only the password, then signs out existing sessions; nothing is created, deleted or written to Firestore:
   ```bash
   cd backend
   gcloud auth application-default login          # an account with Firebase Auth admin rights on shiftsure-a34e9
   export FIREBASE_PROJECT_ID=shiftsure-a34e9 SEED_ADMIN_PASSWORD=... SEED_DEMO_PASSWORD=... SEED_RIDER_PASSWORD=...
   npm run rotate-demo-passwords                  # dry run: lists the accounts it would change
   npm run rotate-demo-passwords -- --apply       # performs the rotation
   ```
6. The Android APK is out of scope for this deployment. If it's needed later: Actions → **Build Android Release** with `api_base_url=https://<backend-url>/api` (see §5.6 on signing).

## 7. Smoke checks

```bash
curl -s https://<ai-url>/health                  # 200
curl -s https://<backend-url>/health             # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<ai-url>/risk-score   # must be 401
curl -s -o /dev/null -w '%{http_code}\n' https://<backend-url>/api/wallet     # must be 401 (no token)
```

5-user checklist:

- [ ] Admin login on `https://shiftsure-a34e9.web.app`; Dashboard, Zones and Claims load
- [ ] Rider files a claim: the response shows `approved`, `rejected` or `pending_review` (never stuck on `pending_verification`)
- [ ] Filing the same trigger again within 30 minutes gets "duplicate claim" (429)
- [ ] An approved claim credits the wallet exactly once, and the ledger shows one `payout_<claimId>` entry
- [ ] Pause Neo4j (or stop AI) and file a claim: it becomes `pending_review` and the wallet is unchanged
- [ ] Admin Override on a `pending_review` claim credits once; clicking Override again is refused
- [ ] Withdrawal shows "Simulated withdrawal … no real money moved"; overdraw is refused
- [ ] Admin-triggered payout (Zones → trigger) credits each eligible rider once

## 8. Rollback

Cloud Run:

```bash
gcloud run revisions list --service shiftsure-backend --region asia-south1
gcloud run services update-traffic shiftsure-backend --region asia-south1 --to-revisions <PREVIOUS_REVISION>=100
# repeat for shiftsure-ai
```

Only the latest 2 images per service are kept, so you can roll back one deploy.

Firebase Hosting:

```bash
firebase hosting:releases:list --project shiftsure-a34e9
firebase hosting:clone shiftsure-a34e9:<OLD_VERSION_ID> shiftsure-a34e9:live
```

Do not run the seed during rollback.

## 9. Credentials hygiene

- The OpenWeatherMap key that was committed in git history (and in `shiftsure_temp-main.zip`) must be **revoked and reissued** before the demo.
- Demo passwords that were published in docs (`Demo@1234`, `Rider@123`, `Admin@123`) are rotated with `npm run rotate-demo-passwords` using new `SEED_*` secrets.
- `backend/serviceAccountKey-1.json` is a downloaded key for a `shiftsure-a34e9` service account. It is gitignored and was never committed, but deployment uses Workload Identity, not key files. Delete that key in GCP Console → IAM → Service accounts → Keys once local work is done. Also note that `backend/serviceAccountKey.json` is not a service account (it's a `shiftsure1` google-services file), so local backend runs need a real key or `gcloud auth application-default login`.
- The live E2E suite must never target `shiftsure-a34e9` during the demo.
- The live E2E suite (`npm run test:e2e`) writes to real Firebase. It is manual-only (Tests workflow → `run_live_e2e`).
