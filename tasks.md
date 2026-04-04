# ShiftSure Implementation Tasks

## Overview
This document tracks all implementation tasks needed to bring the codebase in line with the v8 specification.

**Status Updated:** April 4, 2026
**Implementation Progress:** ~65% Complete

---

## ✅ COMPLETED Tasks

### Phase 1: AI Service (GLM-Tweedie & Dynamic Coverage) - DONE
- [x] **1.1** GLM-Tweedie risk scoring implemented in ai/main.py
- [x] **1.2** Dynamic coverage ratio calculation implemented
- [x] **1.3** Predict-income with income_loss, scaled_payout implemented
- [x] **1.4** Added unsafe_signal to risk scoring

### Phase 2: Backend Verification Pipeline - DONE
- [x] **2.1** Verification pipeline captures all new fields
- [x] **2.2** approveClaim stores: income_loss, scaled_payout, uncovered_loss, coverage_ratio

### Phase 3: Worker & Registration - DONE
- [x] **3.1** Worker tiers renamed: regular → active, low_activity → partly_active
- [x] **3.2** weekly_hours field added to workers
- [x] **3.3** Mock income API endpoint added (GET /api/workers/income)

### Phase 4: Data Model - DONE
- [x] **4.1** Claims store all v8 fields per §16.6
- [x] **4.2** RiskScoreRequest includes unsafe_signal
- [x] **4.3** PredictIncomeRequest includes weekly_hours, demand_factor, coverage_ratio

---

## ⚠️ NEEDS MINOR FIXES

### Tier Thresholds (ai/main.py lines 100-105)
**Current:** 
- tier1: ≥10, tier2: >45, full: >60

**Spec Requires (§9):**
- tier1: 40-59, tier2: 60-79, full: ≥80

- [ ] Fix tier thresholds in ai/main.py to match 40/60/80

### Stress Test BCR (admin.js line 249)
**Issue:** Currently calculates LossRatio, labels as BCR

**Spec Requires (§15.1):**
- LossRatio = total_claimed / total_collected
- BCR = total_collected / total_claimed = 1 / LossRatio

- [ ] Fix stress test to display both LossRatio and BCR correctly

---

## 🔴 CRITICAL - STILL MISSING

### Zone Enrollment Suspension

- [ ] **Zone Suspension 1:** Add `enrollment_suspended` field to zones collection
- [ ] **Zone Suspension 2:** Create `zone_config` collection with audit fields:
  - `zone_id`
  - `enrollment_suspended`
  - `suspension_reason`
  - `suspended_at`
  - `reinstated_at`
  - `reinstated_by`
  - `updated_at`

- [ ] **Zone Suspension 3:** Implement auto-suspension when loss ratio > 85%
  - Add to claims approval flow
  - Update zone state when triggered

- [ ] **Zone Suspension 4:** Update policy purchase to check `enrollment_suspended`
  - Block purchase if zone is suspended
  - Return clear error message

- [ ] **Zone Suspension 5:** Add admin API to toggle enrollment
  - `PATCH /api/admin/zones/:id/enrollment`

- [ ] **Zone Suspension 6:** Update admin dashboard to show suspension status

---

### Wallet Withdrawal

- [ ] **Withdrawal 1:** Add POST /api/wallet/withdraw endpoint
- [ ] **Withdrawal 2:** Handle withdrawal transaction type
- [ ] **Withdrawal 3:** Add withdrawal button to mobile wallet screen

---

## 🟡 MEDIUM PRIORITY

### Policy worker_tier_at_purchase

- [ ] Store `worker_tier_at_purchase` in policy documents at purchase time

### Pool Surplus Tracking

- [ ] Ensure pool surplus calculation uses uncovered_loss correctly

---

## 📋 Notes

- All Firestore compound queries require indexes - document and create as needed
- Testing should cover cap-binding scenarios (scaled_payout > remaining_cap)
- Two-phase flow must remain independent - premium doesn't change mid-week