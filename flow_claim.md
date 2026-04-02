# ShiftSure — Claims Management Architecture

## Scope

Full pipeline: parametric trigger -> peer consensus metadata -> payout calculation -> graph fraud check (dual-layer) -> auto-decision -> payout or reject.

- Peer consensus ratio is computed and stored as metadata on every claim. It does NOT gate payouts. Switchable to a gate later with one config flag.
- Fraud detection is fully automated — no admin approval required. Admin dashboard is monitoring/analytics only, with an optional override for edge cases.
- Neo4j lives entirely inside the AI service (Python). The backend never touches Neo4j directly.
- Neo4j hosted on **Neo4j Aura free tier** (1 instance, 200K nodes — sufficient for Phase 2).

---

## Section 1 — Claims State Machine + Data Model

A claim moves through exactly three states:

```
pending_fraud_check  ->  paid
                     ->  rejected_fraud
```

When the trigger engine fires, a claim document is written immediately with `status: pending_fraud_check`. The backend then calls `/fraud-check` on the AI service synchronously. Based on the decision matrix result, the claim transitions to `paid` (wallet credited) or `rejected_fraud` (no wallet credit, logged in admin fraud report).

**`claims` collection:**

```
claims
  _id
  worker_id
  policy_id
  trigger_event_id
  trigger_type
  risk_score
  payout_amount         (computed — stored even if rejected; wallet credit is what gets skipped)
  eligible_hours
  peer_consensus_ratio  (float 0-1, stored as metadata)
  status                "pending_fraud_check" | "paid" | "rejected_fraud"
  fraud_result: {
    graph_anomaly_score   (float 0-1, from PageRank)
    ring_detected         ("none" | "soft" | "hard")
    trust_score_at_check  (float, snapshot at decision time)
    decision              ("paid" | "rejected_fraud")
    decision_source       ("matrix" for Phase 2; "model" for future ML)
  }
  created_at
  resolved_at
```

**Idempotency:** before writing a new claim, the engine checks for an existing claim with `{ worker_id, trigger_event_id }`. If one exists, it skips — prevents duplicate payouts if the cron overlaps.

---

## Section 2 — Trigger -> Payout Pipeline (Backend Cron)

The 15-minute cron runs this sequence per zone:

```
1. Fetch OpenWeatherMap -> rainfall_mm, heat_index, aqi
   On failure: log error, skip zone this cycle

2. Fetch GET /mock/flood/:zone_id -> flood_signal, severe_flood_signal
3. Fetch GET /mock/dispatch/:dark_store_id -> dispatch_outage

4. POST AI /risk-score -> { risk_score, tier, breakdown }
   Pass zone_restriction: false (automated cycles always)
   flood_score precedence: 100 if severe_flood_signal, else 60 if flood_signal, else 0

5. Update zones.current_risk_score

6. If risk_score < 40 -> stop, no trigger

7. Find eligible workers:
   - active policy this week
   - current time overlaps their shift_slots
   - zone_id matches

8. Compute peer_consensus_ratio:
   total_active_shift_workers = count workers with active policy
                                + shift overlapping now in this zone
   peer_consensus_ratio = eligible_workers / total_active_shift_workers
   (stored as metadata only — does NOT gate the payout)

9. For each eligible worker:
   a. Idempotency check: skip if claim already exists for
      { worker_id, trigger_event_id }

   b. POST AI /predict-income -> { eligible_hours, payout_amount }
      Pass: weekly_income_band, tier, shift_slots,
            trigger_window_start, trigger_window_end,
            zone_density_factor

   c. Apply weekly cap:
      capped = min(payout_amount,
                   policy.weekly_cap - policy.payouts_issued_this_week)
      If capped == 0 -> skip worker

   d. Write claim { status: "pending_fraud_check",
                    peer_consensus_ratio, payout_amount: capped, ... }

   e. POST AI /fraud-check -> { decision, fraud_result }
      Pass: worker_id, zone_id, trigger_event_id,
            trigger_type, peer_consensus_ratio, payout_amount

   f. If decision == "paid":
      - Update claim: status -> "paid", fraud_result, resolved_at = now
      - Credit wallet: add to balance, append transaction record
      - Increment policy.payouts_issued_this_week
      - Update pool: increment total_claimed
      - Send push notification (fire-and-forget)

   g. If decision == "rejected_fraud":
      - Update claim: status -> "rejected_fraud",
                      fraud_result, resolved_at = now
      - NO wallet credit
      - Trust score already reduced by Layer 1 inside AI service
      - Logged in admin fraud report

10. Write trigger_event record (source: "auto")
```

The manual `POST /admin/trigger` runs from step 4 onward with the specified `trigger_type` and `zone_restriction: true` if type is `zone_restriction`. Everything else is identical.

---

## Section 3 — AI Service: `/fraud-check` + Neo4j Dual-Layer Fraud Model

### Neo4j Knowledge Graph Schema (InfDetect-inspired)

```
Nodes:
  (:Worker       { worker_id, trust_score })
  (:Zone         { zone_id })
  (:TriggerEvent { trigger_event_id, zone_id, created_at })
  (:Claim        { claim_id, created_at, payout_amount })

Edges:
  (Worker)-[:IN_ZONE]->(Zone)
  (Worker)-[:FILED]->(Claim)
  (Claim)-[:FROM_EVENT]->(TriggerEvent)
  (TriggerEvent)-[:IN_ZONE]->(Zone)
```

### POST `/fraud-check` (AI service) — Dual-Layer Architecture

**Layer 1 — Graph Intelligence (runs on every claim)**

```
1. Upsert nodes + edges into Neo4j:
   - Upsert Worker node (worker_id, trust_score)
   - Upsert Claim node (claim_id, payout_amount, created_at)
   - Create FILED edge (Worker -> Claim)
   - Create FROM_EVENT edge (Claim -> TriggerEvent)
   Graph grows with every claim — fraud patterns accumulate across weeks.

2. Run PageRank on worker's neighborhood:
   -> graph_anomaly_score (normalized 0-1)
   -> high score = worker is unusually central in the claim graph

3. Run co-claim ring detection (Cypher query):
   MATCH (w:Worker)-[:FILED]->(c:Claim)-[:FROM_EVENT]->(e:TriggerEvent)
   WHERE e.created_at > now() - 30min
   Find all workers who filed claims in the same 30-min window.
   - hard ring: workers span >= 5 different zones AND avg_consensus < 0.3
   - soft ring: workers span >= 3 different zones AND avg_consensus < 0.4
   - none: fewer than 3 zones or consensus >= 0.4

4. Read trust_score from Worker node
```

**Layer 2 — Decision Matrix (deterministic, always reliable)**

Takes 3 inputs from Layer 1: `ring_detected`, `trust_score`, `graph_anomaly_score`

```
                           | trust >= 0.4  | trust 0.2-0.4 | trust < 0.2
------------------------------------------------------------------------
no ring + anomaly < 0.6    |    PAY        |    PAY         |   BLOCK
no ring + anomaly >= 0.6   |    PAY        |    BLOCK       |   BLOCK
soft ring (3+ zones)       |    PAY        |    BLOCK       |   BLOCK
hard ring (5+ zones)       |    BLOCK      |    BLOCK       |   BLOCK
```

**Trust score updates (applied after decision):**

```
BLOCK decision:
  - trust_score -= 0.2

PAY + soft ring or anomaly >= 0.6:
  - trust_score -= 0.1 (accumulates toward future blocks)

PAY + clean:
  - no trust score change
```

**Why dual-layer:**

- Early Phase 2: graph is sparse, PageRank clusters near similar values,
  anomaly score rarely hits 0.6. Matrix still catches fraud via trust score
  erosion + ring detection (Cypher pattern matching works on small graphs).
- Mid Phase 2: graph accumulates data, PageRank differentiates. Anomaly
  score becomes a meaningful third signal.
- Phase 3+: enough data to evaluate whether matrix is still needed or
  graph centrality alone can drive decisions. Can A/B test by logging both.

**Input:**
```
  worker_id, zone_id, trigger_event_id,
  trigger_type, peer_consensus_ratio, payout_amount
```

**Output:**
```
  {
    decision: "paid" | "rejected_fraud",
    fraud_result: {
      graph_anomaly_score,
      ring_detected,
      trust_score_at_check,
      decision_source: "matrix"
    }
  }
```

**Trust score:** starts at 1.0 for every new worker. Decays per the rules above. Stored on the Neo4j Worker node.

---

## Section 4 — Admin Monitoring Dashboard (Fraud Visibility)

The admin dashboard Claims page provides **read-only fraud monitoring** — the system decides autonomously, admin observes.

**`/claims` page — columns:**

```
Rider name | Zone | Trigger type | Amount | Status | Ring | Anomaly Score | Trust | Source | Timestamp
```

- `Status` column: `paid` (green) | `rejected_fraud` (red) | `pending_fraud_check` (grey, transient)
- `Ring` column: `none` / `soft` / `hard`
- `Anomaly Score` column: float 0-1 from PageRank
- `Trust` column: worker's trust_score at decision time

**Filter bar:** Status filter (`all` / `paid` / `rejected`) + Zone filter + Date range

**Optional override (edge cases only):**

```
POST /api/admin/claims/:claim_id/override
  - Only available for status == "rejected_fraud"
  - Admin enters reason for override
  - Transitions claim: status -> "paid"
  - Credits wallet (same logic as auto-pay path)
  - trust_score += 0.1 (partial restore)
  - Logs override with admin_id and reason for audit trail
```

This is intentionally a single action (not approve/reject) since the system already made the decision. Override is for genuinely exceptional cases — not part of the normal flow.
