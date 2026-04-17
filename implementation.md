# ShiftSure Implementation Plan

## Phase 1: AI Service (GLM-Tweedie & Dynamic Coverage)

### 1.1 Replace Rule-Based Risk Scoring with GLM-Tweedie

**File: `ai/main.py`**

Replace the entire `/risk-score` endpoint with:

```python
# GLM Coefficients (calibrated from synthetic data)
GLM_COEFFICIENTS = {
    'beta0': -2.5,      # Intercept
    'beta1_rain': 0.8,   # Rainfall
    'beta2_flood': 1.2,  # Flood
    'beta3_dispatch': 0.9, # Dispatch outage
    'beta4_heat': 0.7,    # Heat index
    'beta5_restriction': 1.0, # Zone restriction
    'beta6_unsafe': 0.85,  # Unsafe area (NEW)
}

RISK_REFERENCE = 15.0  # Expected loss for severe disruption conditions

@app.post("/risk-score", response_model=RiskScoreResponse, tags=["Risk"])
def risk_score(req: RiskScoreRequest):
    # Calculate expected loss using GLM log-link
    expected_loss = math.exp(
        GLM_COEFFICIENTS['beta0']
        + GLM_COEFFICIENTS['beta1_rain'] * req.rainfall_mm
        + GLM_COEFFICIENTS['beta2_flood'] * (req.flood_signal + 2 * req.severe_flood_signal)
        + GLM_COEFFICIENTS['beta3_dispatch'] * int(req.dispatch_outage)
        + GLM_COEFFICIENTS['beta4_heat'] * (req.heat_index / 10)  # Scale down
        + GLM_COEFFICIENTS['beta5_restriction'] * int(req.zone_restriction)
        + GLM_COEFFICIENTS['beta6_unsafe'] * int(req.unsafe_signal)  # NEW
    )
    
    # Normalize to 0-100 risk score
    risk_score_val = min(100, (expected_loss / RISK_REFERENCE) * 100)
    
    # Determine tier
    tier = "full" if risk_score_val >= 80 else "tier2" if risk_score_val >= 60 else "tier1" if risk_score_val >= 40 else "none"
    
    return RiskScoreResponse(
        risk_score=round(risk_score_val, 2),
        tier=tier,
        expected_loss=round(expected_loss, 2)  # Return for coverage ratio calculation
    )
````

__File: `ai/models.py`__

Update models:

```python
class RiskScoreRequest(BaseModel):
    zone_id: str
    rainfall_mm: float = 0.0
    flood_signal: bool = False
    severe_flood_signal: bool = False
    dispatch_outage: bool = False
    heat_index: float = 0.0
    aqi: float = 0.0
    zone_restriction: bool = False
    unsafe_signal: bool = False  # NEW FIELD

class RiskScoreResponse(BaseModel):
    risk_score: float
    tier: str
    expected_loss: float  # NEW - needed for coverage ratio
    breakdown: RiskBreakdown  # Keep for compatibility
```

### 1.2 Implement Dynamic Coverage Ratio

__File: `ai/main.py`__

Add helper function:

```python
@app.post("/calculate-coverage-ratio", response_model=CoverageRatioResponse, tags=["Coverage"])
def calculate_coverage_ratio(req: CoverageRatioRequest):
    """
    Calculate dynamic coverage ratio based on zone risk and pool health.
    
    S = 0.6 × (1 − R) + 0.4 × P
    coverage_ratio = 0.55 + 0.15 × S
    """
    # Step 1: Normalize zone risk (R)
    # expected_loss comes from GLM risk score
    risk_reference = 15.0  # Severe disruption reference
    R = min(1.0, req.expected_loss / risk_reference)
    
    # Step 2: Normalize pool health (P)
    # BCR = PremiumPool / ExpectedClaims
    if req.premium_pool > 0 and req.expected_claims > 0:
        BCR = req.premium_pool / req.expected_claims
    else:
        BCR = 1.8  # Default healthy
    
    BCR_max = 1.8  # Healthy pool buffer threshold
    P = max(0.0, min(1.0, (BCR - 1) / BCR_max))
    
    # Step 3: Compute stability score (S)
    w1 = 0.6  # Zone risk weight
    w2 = 0.4  # Pool health weight
    S = w1 * (1 - R) + w2 * P
    
    # Step 4: Compute coverage ratio
    coverage_ratio = 0.55 + 0.15 * S
    coverage_ratio = max(0.55, min(0.70, coverage_ratio))  # Bound to [0.55, 0.70]
    
    return CoverageRatioResponse(
        coverage_ratio=round(coverage_ratio, 4),
        zone_risk_R=round(R, 4),
        pool_health_P=round(P, 4),
        stability_score_S=round(S, 4),
        bcr=round(BCR, 4)
    )
```

Add new models:

```python
class CoverageRatioRequest(BaseModel):
    expected_loss: float
    premium_pool: float  # total_collected
    expected_claims: float  # total_claimed

class CoverageRatioResponse(BaseModel):
    coverage_ratio: float
    zone_risk_R: float
    pool_health_P: float
    stability_score_S: float
    bcr: float
```

### 1.3 Update Predict-Income Endpoint

__File: `ai/main.py`__

Replace `/predict-income` endpoint:

```python
@app.post("/predict-income", response_model=PredictIncomeResponse, tags=["Income"])
def predict_income(req: PredictIncomeRequest):
    """
    Income loss and scaled payout calculation.
    
    hourly_income = weekly_income_band / weekly_hours
    income_loss = hourly_income × eligible_hours × demand_factor
    scaled_payout = income_loss × coverage_ratio
    """
    # Calculate eligible hours (same logic as before)
    # ...
    
    # Calculate income loss
    hourly_income = req.weekly_income_band / req.weekly_hours
    demand_factor = req.demand_factor if hasattr(req, 'demand_factor') else 1.0
    income_loss = hourly_income * eligible_hours * demand_factor
    
    # Apply coverage ratio (passed from backend after calculation)
    coverage_ratio = req.coverage_ratio
    scaled_payout = income_loss * coverage_ratio
    
    return PredictIncomeResponse(
        eligible_hours=round(eligible_hours, 3),
        income_loss=round(income_loss, 2),
        scaled_payout=round(scaled_payout, 2),
        coverage_ratio=coverage_ratio
    )
```

Update models:

```python
class PredictIncomeRequest(BaseModel):
    weekly_income_band: int
    tier: str
    weekly_hours: float  # NEW
    shift_slots: list[ShiftSlot]
    trigger_window_start: str
    trigger_window_end: str
    zone_density_factor: float = 1.0
    demand_factor: float = 1.0  # NEW
    coverage_ratio: float  # NEW - passed from coverage ratio endpoint

class PredictIncomeResponse(BaseModel):
    eligible_hours: float
    income_loss: float  # RENAMED from estimated_income
    scaled_payout: float  # NEW - replaces payout_amount
    coverage_ratio: float  # NEW
```

---

## Phase 2: Backend Verification Pipeline

### 2.1 Update Claims Filing Route

__File: `backend/routes/claims.js`__

Step 7-8 in `/file` endpoint:

```javascript
// Step 7: Get coverage ratio first (needs zone expected_loss and pool data)
const { getCoverageRatio } = require('../services/aiService');
const poolSnap = await db.collection('pools')
  .where('zone_id', '==', worker.zone_id)
  .limit(1).get();

let coverage_ratio = 0.625; // Default midpoint
if (!poolSnap.empty) {
  const pool = poolSnap.docs[0].data();
  const zoneExpectedLoss = zone.current_risk_score || 15; // Use risk score as proxy
  const coverageResult = await getCoverageRatio({
    expected_loss: zoneExpectedLoss,
    premium_pool: pool.total_collected || 0,
    expected_claims: pool.total_claimed || 0
  });
  coverage_ratio = coverageResult.coverage_ratio;
}

// Step 8: Call AI predict-income with coverage_ratio
const incomePayload = {
  weekly_income_band: worker.weekly_income_band,
  weekly_hours: worker.weekly_hours || 40, // Default 40 hours
  tier,
  shift_slots: policy.shift_slots || [],
  trigger_window_start: windowStart.toISOString(),
  trigger_window_end: windowEnd.toISOString(),
  zone_density_factor: zone.zone_density_factor || 1.0,
  demand_factor: 1.0, // Default
  coverage_ratio: coverage_ratio
};
const incomeResult = await predictIncome(incomePayload);
```

### 2.2 Update approveClaim Function

__File: `backend/services/verificationPipeline.js`__

```javascript
async function approveClaim(db, claimRef, policyRef, worker, policy, data) {
  // Calculate uncovered_loss
  const income_loss = data.income_loss || 0;
  const capped_payout = data.payout_amount;
  const uncovered_loss = Math.max(0, income_loss - capped_payout);
  
  const batch = db.batch();
  
  // Update claim with ALL new fields
  batch.update(claimRef, {
    status: 'approved',
    income_loss: income_loss,
    scaled_payout: data.scaled_payout || 0,
    payout_amount: capped_payout,
    uncovered_loss: uncovered_loss,
    coverage_ratio: data.coverage_ratio || 0.625,
    // ... existing fields
  });
  
  // ... rest of function
}
```

---

## Phase 3: Worker Tier & Registration

### 3.1 Rename Worker Tiers

__File: `backend/routes/workers.js`__

```javascript
// In registration
batch.set(workerRef, {
  // ...
  worker_tier: 'active',  // Changed from 'regular'
  // ...
});
```

__File: `backend/routes/policies.js`__

```javascript
// In purchase logic
const workerTier = worker.active_days_this_week >= 3 ? 'active' : 'partly_active'; // Changed

// Set effective_weekly_cap
let effectiveCap = weeklyCap;
if (workerTier === 'partly_active') {  // Changed from 'low_activity'
  effectiveCap = weeklyCap * 0.6;
}

// Add to policy document
{
  worker_tier_at_purchase: workerTier,
  effective_weekly_cap: effectiveCap,
  // ...
}
```

### 3.2 Mock Income API

__File: `backend/routes/workers.js`__

Add new endpoint:

```javascript
// GET /api/workers/income
router.get('/income', auth, async (req, res) => {
  // Mock income based on worker characteristics
  // In production, this would call actual platform API
  const baseIncome = 8000 + Math.floor(Math.random() * 7000); // 8000-15000
  return res.json({
    worker_id: req.uid,
    weekly_income: baseIncome,
    currency: 'INR',
    source: 'mock_income_api'
  });
});
```

---

## Phase 4: Zone Enrollment Suspension

### 4.1 Add Suspension Fields

__File: `backend/config/firebase.js`__ - Add helper functions

### 4.2 Auto-Suspension Logic

__File: `backend/services/triggerEngine.js` or new `zoneService.js`__

```javascript
async function checkAndSuspendZone(db, zoneId) {
  // Calculate loss ratio
  const poolsSnap = await db.collection('pools')
    .where('zone_id', '==', zoneId)
    .get();
  
  let totalCollected = 0;
  let totalClaimed = 0;
  poolsSnap.forEach(p => {
    totalCollected += p.data().total_collected || 0;
    totalClaimed += p.data().total_claimed || 0;
  });
  
  const lossRatio = totalCollected > 0 ? totalClaimed / totalCollected : 0;
  
  // Auto-suspend if loss ratio > 85%
  if (lossRatio > 0.85) {
    const batch = db.batch();
    
    // Update zone
    const zoneRef = db.collection('zones').doc(zoneId);
    batch.update(zoneRef, { enrollment_suspended: true });
    
    // Create zone_config audit record
    const configRef = db.collection('zone_config').doc(zoneId);
    batch.set(configRef, {
      zone_id: zoneId,
      enrollment_suspended: true,
      suspension_reason: `Auto-suspended: Loss ratio ${(lossRatio * 100).toFixed(1)}% exceeds 85% threshold`,
      suspended_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    await batch.commit();
  }
}
```

### 4.3 Admin Enrollment API

__File: `backend/routes/admin.js`__

```javascript
// PATCH /api/admin/zones/:id/enrollment
router.patch('/zones/:id/enrollment', adminAuth, async (req, res) => {
  const { suspended, reason } = req.body;
  const db = getDb();
  
  const batch = db.batch();
  
  // Update zone
  batch.update(db.collection('zones').doc(req.params.id), {
    enrollment_suspended: suspended,
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Update zone_config
  const configData = {
    zone_id: req.params.id,
    enrollment_suspended: suspended,
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  };
  
  if (suspended) {
    configData.suspension_reason = reason;
    configData.suspended_at = admin.firestore.FieldValue.serverTimestamp();
  } else {
    configData.reinstated_at = admin.firestore.FieldValue.serverTimestamp();
    configData.reinstated_by = req.uid;
  }
  
  batch.set(db.collection('zone_config').doc(req.params.id), configData, { merge: true });
  
  await batch.commit();
  
  return res.json({ success: true, zone_id: req.params.id, enrollment_suspended: suspended });
});
```

### 4.4 Policy Purchase Check

__File: `backend/routes/policies.js`__

```javascript
// At start of purchase
const zoneDoc = await db.collection('zones').doc(worker.zone_id).get();
if (zoneDoc.exists && zoneDoc.data().enrollment_suspended) {
  return res.status(403).json({ error: 'Policy purchase is currently suspended for your zone due to high loss ratio. Please try again later or contact support.' });
}
```

---

## Phase 5: Wallet Withdrawal

### 5.1 Add Withdrawal Endpoint

__File: `backend/routes/wallet.js`__

```javascript
// POST /api/wallet/withdraw
router.post('/withdraw', auth, async (req, res) => {
  const { amount } = req.body;
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid withdrawal amount' });
  }
  
  const db = getDb();
  const walletRef = db.collection('wallets').doc(req.uid);
  
  const walletDoc = await walletRef.get();
  const currentBalance = walletDoc.data().balance || 0;
  
  if (amount > currentBalance) {
    return res.status(400).json({ error: 'Insufficient balance for withdrawal' });
  }
  
  // Process withdrawal
  const batch = db.batch();
  
  batch.update(walletRef, {
    balance: admin.firestore.FieldValue.increment(-amount),
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  });
  
  batch.update(walletRef.collection('transactions').doc(), {
    type: 'withdrawal',
    amount: amount,
    status: 'pending', // Or 'completed' for instant
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });
  
  await batch.commit();
  
  return res.json({ success: true, amount_withdrawn: amount });
});
```

---

## Phase 6: Admin Dashboard Updates

### 6.1 Fix BCR/LossRatio Display

__File: `admin/lib/screens/dashboard_screen.dart`__

```dart
// Current (WRONG):
// BCR = total_claimed / total_collected

// Correct:
LossRatio = total_claimed / total_collected
BCR = total_collected / total_claimed

// Target ranges:
LossRatio: 0.60-0.75 (healthy)
BCR: 1.33-1.67 (healthy)
```

### 6.2 Add Enrollment Status to Zones

__File: `admin/lib/screens/zones_screen.dart`__

```dart
// Show suspension badge
if (zone['enrollment_suspended'] == true)
  Chip(
    label: Text('SUSPENDED', style: TextStyle(color: Colors.red)),
    backgroundColor: Colors.red.withOpacity(0.2),
  )

// Add toggle button
ElevatedButton(
  onPressed: () => toggleEnrollment(zone['id'], !zone['enrollment_suspended']),
  child: Text(zone['enrollment_suspended'] ? 'Re-enroll' : 'Suspend'),
)
```

---

## Phase 7: Seed Data Updates

### 7.1 Required Seed Changes

__File: `backend/scripts/seed.js`__

1. Add `weekly_hours` to workers (e.g., 35-50 hours)
2. Add `worker_tier_at_purchase` to policies
3. Add at least one zone with `enrollment_suspended: true`
4. Add corresponding `zone_config` document
5. Update claims to include: `income_loss`, `scaled_payout`, `uncovered_loss`, `coverage_ratio`
6. Add `withdrawal` transactions to some wallets

---

## Implementation Order

1. __Phase 1: AI Service__ (Tasks 1.1, 1.2, 1.3)

   - Replace risk scoring
   - Add coverage ratio
   - Update predict-income

2. __Phase 2: Backend__ (Tasks 2.1, 2.2)

   - Update verification pipeline
   - Add uncovered_loss

3. __Phase 3: Worker Tiers__ (Tasks 3.1, 3.2)

   - Rename tiers
   - Add mock income API

4. __Phase 4: Zone Suspension__ (Tasks 4.1-4.4)

   - Auto-suspension logic
   - Admin API
   - Purchase check

5. __Phase 5: Wallet__ (Task 5.1)

   - Withdrawal endpoint

6. __Phase 6: Admin__ (Tasks 6.1, 6.2)

   - Fix BCR
   - Add suspension UI

7. __Phase 7: Seed__ (Task 7.1)

   - Update seed data

---

## Testing Checklist

- [ ] Risk score produces values 0-100
- [ ] Coverage ratio stays in [0.55, 0.70]
- [ ] Cap-binding: when scaled_payout > remaining_cap, payout = remaining_cap
- [ ] uncovered_loss = income_loss - capped_payout (not scaled_payout)
- [ ] Policy blocked when zone enrollment suspended
- [ ] Auto-suspension triggers at 85% loss ratio
- [ ] Worker tier displays correctly (active/partly_active)
- [ ] Withdrawal deducts balance
- [ ] BCR/LossRatio calculation correct