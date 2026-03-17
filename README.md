# ShiftSure
### AI-Powered Weekly Income Protection for Grocery / Q-Commerce Delivery Partners

## Team Details
- **Hackathon:** Guidewire DEVTrails 2026
- **Phase:** Seed / Phase 1 - Ideation & Foundation
- **Persona Chosen:** Grocery / Q-Commerce Delivery Partners
- **Team Name:** Meow Company
- **University:** SRM IST

## Demo Links
- **GitHub Repository:** https://github.com/Zmey1/guidewire_meow_company
- **2-Minute Public Video:** [Add video link here]
- **Prototype / Figma:** [Add prototype link here]

---

## Problem Statement

India’s grocery and q-commerce delivery partners work on highly time-sensitive shifts and depend on weekly earnings for financial stability. Even short disruptions such as heavy rain, flooding, dark-store outages, or sudden zone restrictions can reduce their working hours and directly cut their income.

Today, there is no simple, automated financial protection product built specifically for this kind of income loss.

**ShiftSure** is an AI-powered, parametric income protection platform designed for grocery / q-commerce riders. It protects workers against **loss of income caused by external disruptions**, using a **weekly pricing model**, automated trigger detection, and instant claim initiation.

---

## Why We Chose Grocery / Q-Commerce

We selected **Grocery / Q-Commerce** as our target persona because this segment is especially vulnerable to hyperlocal disruptions.

### Why this segment is ideal
- Deliveries are extremely time-sensitive
- Riders depend on narrow peak-hour earning windows
- Dark-store operations can halt suddenly
- Hyperlocal rain or flooding can stop pickups and drop-offs immediately
- Loss of income is easier to model and demonstrate clearly

This makes q-commerce a strong fit for **parametric insurance**, where claims are triggered by predefined real-world events instead of manual, paperwork-heavy verification.

---

## Coverage Scope

### Included
- Lost delivery earnings due to verified disruption events
- Missed work hours caused by weather or platform-side disruptions
- Income loss during active declared shifts

### Excluded
- Health insurance
- Accident insurance
- Life insurance
- Vehicle repair costs
- Medical reimbursements

Our product is intentionally focused only on protecting **lost wages / lost working hours**.

---

## User Persona

### Primary User
**Ravi**, 24, is a q-commerce delivery rider operating in a dense urban zone. He works evening shifts from 5 PM to 11 PM and depends on consistent daily delivery volume from nearby dark stores.

### User Pain Points
- Sudden heavy rain reduces orders or blocks roads
- Dark-store dispatch pauses leave him idle
- Local waterlogging prevents pickups and drop-offs
- Temporary zone restrictions cut off his working area
- No safety net exists for hours he was ready to work but could not earn

---

## Core Scenario

Ravi buys a weekly ShiftSure protection plan before starting his work week.

On Wednesday evening:
- Heavy rain begins in his operating zone
- Roads near the assigned dark store become waterlogged
- Store dispatch slows and then pauses
- Ravi’s declared active shift overlaps with the disruption window

ShiftSure detects:
- zone-level rain severity
- flood / waterlogging signal
- rider-zone match
- shift overlap
- dispatch interruption

The platform automatically initiates a claim, estimates protected lost hours, and simulates a payout to Ravi’s registered UPI account.

---

## Solution Overview

ShiftSure has six core modules:

1. **Smart Onboarding**
2. **AI-Assisted Risk Profiling**
3. **Weekly Policy Creation**
4. **Parametric Trigger Monitoring**
5. **Automatic Claims and Payout Simulation**
6. **Fraud Detection and Validation**

---

## Product Workflow

### 1. Rider Onboarding
The rider enters:
- name
- phone number
- city
- operating zone
- dark-store cluster
- preferred work slots
- average weekly income band
- UPI ID
- consent for location-based validation

### 2. Risk Profiling
ShiftSure calculates a rider-zone risk profile using:
- hyperlocal weather risk
- flood / waterlogging likelihood
- disruption history
- dark-store reliability
- shift timing exposure

### 3. Weekly Plan Recommendation
The rider receives a recommended weekly protection plan based on:
- expected income
- risk zone
- work pattern
- disruption likelihood

### 4. Policy Activation
The rider buys a 7-day protection plan.

### 5. Trigger Monitoring
ShiftSure continuously checks live or mock disruption feeds.

### 6. Claim Initiation
If a disruption overlaps with the rider’s active declared shift and validated zone, the claim is initiated automatically.

### 7. Payout Simulation
Eligible claims are processed through a mock payout system and shown on the worker dashboard.

---

## Parametric Triggers

We selected triggers that are:
- realistic for q-commerce
- easy to explain
- easy to simulate in a hackathon demo
- strongly linked to income loss

### Trigger 1: Heavy Rain
A claim condition is met when rainfall in the rider’s operating zone crosses a defined threshold during an active shift.

### Trigger 2: Flood / Waterlogging
A claim condition is met when local waterlogging or flood conditions make pickup or drop locations inaccessible.

### Trigger 3: Dark-Store / Platform Outage
A claim condition is met when the assigned store cannot dispatch orders or when the platform experiences a dispatch outage in that zone.

### Trigger 4: Zone Restriction / Closure
A claim condition is met when curfews, police restrictions, market closures, or sudden access restrictions prevent deliveries.

---

## AI Layer

ShiftSure uses lightweight, explainable AI models to support risk-aware decision-making, fair pricing, and more accurate compensation.

### 1. Risk Scoring
A composite risk score is calculated using:
- real-time weather conditions
- historical disruption patterns
- zone-specific vulnerability such as flood-prone areas and traffic density
- dark-store reliability
- shift timing exposure

This score helps estimate how likely a disruption is for a rider in a specific zone and time window.

### 2. Income Prediction
ShiftSure estimates a rider’s expected earnings for a given shift using:
- historical delivery density in the zone
- rider’s selected work hours
- simulated platform demand patterns
- environmental disruption conditions

This gives us a baseline estimate of **protected shift income**, which represents what the rider would likely have earned under normal conditions.

### 3. Income-Aware Loss Estimation
ShiftSure does not stop at event detection. It also estimates the likely financial impact of the disruption.

The product uses:
- **parametric triggers** to determine claim eligibility
- **expected shift-income estimation** to measure earnings impact
- **policy caps and plan rules** to determine final payout

This gives us a stronger model than a flat event-based payout while still keeping the system parametric and automation-friendly.

---

## Weekly Premium Model

Gig workers typically think in short earning cycles, so ShiftSure uses a **weekly pricing model**.

### Plan Tiers

| Plan | Weekly Coverage Cap | Best For |
|------|---------------------:|----------|
| Lite | ₹1,500 | Lower weekly risk exposure |
| Standard | ₹2,500 | Average q-commerce rider |
| Plus | ₹4,000 | Higher dependency on delivery income |

### Base Weekly Premium

| Plan | Base Price |
|------|-----------:|
| Lite | ₹29 |
| Standard | ₹49 |
| Plus | ₹79 |

### Premium Formula

```text
Weekly Premium = Base Plan Price + Zone Risk Add-on + Forecast Risk Add-on - Reliability Discount
