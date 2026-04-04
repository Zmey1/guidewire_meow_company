# ShiftSure Implementation Plan

## Updated Status: April 4, 2026

**Progress:** ~65% complete

---

## ✅ ALREADY IMPLEMENTED (See tasks.md)

### Phase 1: AI Service - DONE
- GLM-Tweedie risk scoring (ai/main.py lines 55-121)
- Dynamic coverage ratio (lines 139-178)
- Predict-income with income_loss/scaled_payout (lines 181-245)
- unsafe_signal added

### Phase 2: Backend - DONE
- Verification pipeline with all v8 fields
- Claims data model with income_loss, scaled_payout, uncovered_loss, coverage_ratio

### Phase 3: Workers - DONE
- Tier renaming (active/partly_active)
- weekly_hours field
- Mock income API

---

## ⚠️ MINOR FIXES NEEDED

### Fix 1: Tier Thresholds

**File:** `ai/main.py` lines 100-105

**Current (wrong):**
```python
if risk_score > 60:
    tier = "full"
elif risk_score > 45:
    tier = "tier2"
elif risk_score >= 10:
    tier = "tier1"
else:
    tier = "none"
```

**Should be:**
```python
if risk_score >= 80:
    tier = "full"
elif risk_score >= 60:
    tier = "tier2"
elif risk_score >= 40:
    tier = "tier1"
else:
    tier = "none"
```

---

### Fix 2: Stress Test BCR/LossRatio

**File:** `backend/routes/admin.js` line 249

**Current (wrong):**
```javascript
const projectedBCR = currentCollected ? projectedClaimed / currentCollected : 0;
```

**Should calculate both:**
```javascript
const projectedLossRatio = currentCollected ? projectedClaimed / currentCollected : 0;
const projectedBCR = projectedClaimed ? currentCollected / projectedClaimed : 0;
```

Return both in response.

---

## 🔴 REMAINING: ZONE ENROLLMENT SUSPENSION

### Implementation:

**File: `backend/services/zoneService.js`** (new file)

```javascript
const { getDb } = require('../config/firebase');
const admin = require('firebase-admin');

async function checkAndSuspendZone(db, zoneId) {
  // Calculate loss ratio for zone
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
    batch.update(zoneRef, { 
      enrollment_suspended: true,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
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
    console.log(`[Zone] Auto-suspended zone ${zoneId} - Loss ratio ${(lossRatio * 100).toFixed(1)}%`);
  }
}

module.exports = { checkAndSuspendZone };
```

---

### Add to Claims Approval Flow

**File:** `backend/services/verificationPipeline.js`

After line 288 (`console.log(approved...)`), add:

```javascript
// Check zone loss ratio and auto-suspend if needed
if (policy.zone_id) {
  const { checkAndSuspendZone } = require('./zoneService');
  await checkAndSuspendZone(db, policy.zone_id);
}
```

---

### Policy Purchase Check

**File:** `backend/routes/policies.js`

At start of purchase flow, add:

```javascript
// Check if zone enrollment is suspended
const zoneDoc = await db.collection('zones').doc(worker.zone_id).get();
if (zoneDoc.exists && zoneDoc.data().enrollment_suspended) {
  return res.status(403).json({ error: 'Policy purchase is suspended for your zone due to high loss ratio. Please contact support.' });
}
```

---

### Admin API

**File:** `backend/routes/admin.js`

Add new endpoint:

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

---

## 🔴 REMAINING: WALLET WITHDRAWAL

### Implementation:

**File:** `backend/routes/wallet.js`

Add endpoint:

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
    status: 'pending',
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });
  
  await batch.commit();
  
  return res.json({ success: true, amount_withdrawn: amount });
});
```

---

## 📋 Implementation Order

1. Fix tier thresholds in ai/main.py
2. Fix stress test BCR/LossRatio in admin.js
3. Create zoneService.js
4. Add auto-suspension to claims approval
5. Add policy purchase suspension check
6. Add admin enrollment toggle API
7. Add wallet withdrawal endpoint

---

## Testing Checklist

- [ ] Tier thresholds at 40/60/80
- [ ] Stress test shows LossRatio AND BCR
- [ ] Policy blocked when zone enrollment suspended
- [ ] Auto-suspension at 85% loss ratio
- [ ] Admin can re-enable enrollment
- [ ] Withdrawal deducts wallet balance