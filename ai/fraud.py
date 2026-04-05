"""
fraud.py — Neo4j graph operations for ShiftSure fraud detection (InfDetect-inspired).

Nodes:  Worker, Zone, TriggerEvent, Claim
Edges:  FILED, FROM_EVENT, IN_ZONE
"""

import os
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from neo4j import GraphDatabase
from dotenv import load_dotenv

_AI_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _AI_DIR.parent

# Load AI-local env first, then shared backend env as a fallback for local dev.
load_dotenv(_AI_DIR / ".env")
load_dotenv(_REPO_ROOT / "backend" / ".env")
logger = logging.getLogger(__name__)

_driver = None


def get_driver():
    global _driver
    if _driver is None:
        uri = os.getenv("NEO4J_URI", "")
        user = os.getenv("NEO4J_USER", "neo4j")
        password = os.getenv("NEO4J_PASSWORD", "")
        if not uri:
            raise RuntimeError("NEO4J_URI not set in environment")
        _driver = GraphDatabase.driver(uri, auth=(user, password))
    return _driver


def close_driver():
    global _driver
    if _driver:
        _driver.close()
        _driver = None


# ── Upsert graph nodes/edges ─────────────────────────────────────────────────

def upsert_graph(tx, worker_id: str, zone_id: str, trigger_event_id: str,
                 claim_id: str, payout_amount: float, created_at: str):
    # Ensure Worker node exists with default trust if new
    tx.run("""
        MERGE (w:Worker {worker_id: $worker_id})
        ON CREATE SET w.trust_score = 1.0
    """, worker_id=worker_id)

    # Ensure Zone node exists
    tx.run("""
        MERGE (z:Zone {zone_id: $zone_id})
    """, zone_id=zone_id)

    # Ensure TriggerEvent node exists
    tx.run("""
        MERGE (te:TriggerEvent {trigger_event_id: $trigger_event_id})
        ON CREATE SET te.zone_id = $zone_id, te.created_at = $created_at
    """, trigger_event_id=trigger_event_id, zone_id=zone_id, created_at=created_at)

    # Create Claim node
    tx.run("""
        MERGE (c:Claim {claim_id: $claim_id})
        ON CREATE SET c.payout_amount = $payout_amount, c.created_at = $created_at
    """, claim_id=claim_id, payout_amount=payout_amount, created_at=created_at)

    # Edges
    tx.run("""
        MATCH (w:Worker {worker_id: $worker_id})
        MATCH (c:Claim {claim_id: $claim_id})
        MERGE (w)-[:FILED]->(c)
    """, worker_id=worker_id, claim_id=claim_id)

    tx.run("""
        MATCH (c:Claim {claim_id: $claim_id})
        MATCH (te:TriggerEvent {trigger_event_id: $trigger_event_id})
        MERGE (c)-[:FROM_EVENT]->(te)
    """, claim_id=claim_id, trigger_event_id=trigger_event_id)

    tx.run("""
        MATCH (w:Worker {worker_id: $worker_id})
        MATCH (z:Zone {zone_id: $zone_id})
        MERGE (w)-[:IN_ZONE]->(z)
    """, worker_id=worker_id, zone_id=zone_id)

    tx.run("""
        MATCH (te:TriggerEvent {trigger_event_id: $trigger_event_id})
        MATCH (z:Zone {zone_id: $zone_id})
        MERGE (te)-[:IN_ZONE]->(z)
    """, trigger_event_id=trigger_event_id, zone_id=zone_id)


# ── PageRank-style anomaly (degree heuristic) ──────────────────────────────

def compute_anomaly_score(tx, worker_id: str) -> float:
    """
    Approximate anomaly via claim degree relative to neighbourhood.
    Workers who have filed disproportionately many claims vs their peers
    in the same zone get a higher score.
    """
    result = tx.run("""
        MATCH (w:Worker {worker_id: $worker_id})-[:IN_ZONE]->(z:Zone)
        OPTIONAL MATCH (w)-[:FILED]->(wc:Claim)
        WITH w, z, count(wc) AS worker_claims
        OPTIONAL MATCH (peer:Worker)-[:IN_ZONE]->(z)
        OPTIONAL MATCH (peer)-[:FILED]->(pc:Claim)
        WITH worker_claims, count(pc) AS total_zone_claims,
             count(DISTINCT peer) AS peer_count
        RETURN worker_claims, total_zone_claims, peer_count
    """, worker_id=worker_id)

    record = result.single()
    if not record:
        return 0.0

    worker_claims = record["worker_claims"] or 0
    total_zone_claims = record["total_zone_claims"] or 0
    peer_count = record["peer_count"] or 1

    if total_zone_claims == 0:
        return 0.0

    avg_zone_claims = total_zone_claims / peer_count
    if avg_zone_claims == 0:
        return 0.0

    raw = (worker_claims / avg_zone_claims) - 1.0  # 0 means exactly average
    # Clamp to [0, 1]
    return round(min(1.0, max(0.0, raw / 4.0)), 4)


# ── Co-claim ring detection ─────────────────────────────────────────────────

def detect_ring(tx, zone_id: str, window_start: str, window_end: str,
                peer_consensus_ratio: float) -> str:
    """
    Count distinct workers who filed claims in the same zone within a 30-min window.
    hard ring : >= 5 co-filers AND avg_consensus < 0.3
    soft ring : >= 3 co-filers AND avg_consensus < 0.4
    none      : otherwise
    """
    result = tx.run("""
        MATCH (w:Worker)-[:FILED]->(c:Claim)-[:FROM_EVENT]->(te:TriggerEvent {zone_id: $zone_id})
        WHERE te.created_at >= $window_start AND te.created_at <= $window_end
        RETURN count(DISTINCT w) AS co_filers
    """, zone_id=zone_id, window_start=window_start, window_end=window_end)

    record = result.single()
    co_filers = record["co_filers"] if record else 0

    if co_filers >= 5 and peer_consensus_ratio < 0.3:
        return "hard"
    if co_filers >= 3 and peer_consensus_ratio < 0.4:
        return "soft"
    return "none"


# ── Read trust score ────────────────────────────────────────────────────────

def get_trust_score(tx, worker_id: str) -> float:
    result = tx.run("""
        MATCH (w:Worker {worker_id: $worker_id})
        RETURN w.trust_score AS trust
    """, worker_id=worker_id)
    record = result.single()
    return float(record["trust"]) if record and record["trust"] is not None else 1.0


# ── Update trust score ──────────────────────────────────────────────────────

def update_trust(tx, worker_id: str, delta: float):
    tx.run("""
        MATCH (w:Worker {worker_id: $worker_id})
        SET w.trust_score = max(0.0, min(1.0, w.trust_score + $delta))
    """, worker_id=worker_id, delta=delta)


# ── Full fraud check ────────────────────────────────────────────────────────

def run_fraud_check(worker_id: str, zone_id: str, trigger_event_id: str,
                    claim_id: str, payout_amount: float,
                    peer_consensus_ratio: float) -> dict:
    driver = get_driver()
    now = datetime.now(timezone.utc).isoformat()
    window_start = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()

    with driver.session() as session:
        # Layer 1: upsert graph
        session.execute_write(upsert_graph, worker_id, zone_id, trigger_event_id,
                              claim_id, payout_amount, now)

        # Layer 1: compute metrics
        anomaly_score = session.execute_read(compute_anomaly_score, worker_id)
        ring = session.execute_read(detect_ring, zone_id, window_start, now,
                                    peer_consensus_ratio)
        trust = session.execute_read(get_trust_score, worker_id)

    # Layer 2: decision matrix
    # Rows: ring condition / Cols: trust band
    decision = _decision_matrix(trust, anomaly_score, ring)

    # Trust update
    delta = 0.0
    if decision == "rejected":
        delta = -0.2
    elif decision == "approved" and (ring in ("soft",) or anomaly_score >= 0.6):
        delta = -0.1

    if delta != 0.0:
        with driver.session() as session:
            session.execute_write(update_trust, worker_id, delta)

    return {
        "decision": decision,
        "fraud_result": {
            "graph_anomaly_score": anomaly_score,
            "ring_detected": ring,
            "trust_score_at_check": trust,
            "decision_source": "matrix",
        }
    }


def _decision_matrix(trust: float, anomaly: float, ring: str) -> str:
    """
    Decision matrix (from spec):

                        | trust >= 0.4 | trust 0.2-0.4 | trust < 0.2
    -----------------------------------------------------------------
    no ring + anomaly < 0.6  |   PAY        |   PAY          |  BLOCK
    no ring + anomaly >= 0.6 |   PAY        |   BLOCK        |  BLOCK
    soft ring (3+ zones)     |   PAY        |   BLOCK        |  BLOCK
    hard ring (5+ zones)     |   BLOCK      |   BLOCK        |  BLOCK
    """
    if ring == "hard":
        return "rejected"

    if trust < 0.2:
        return "rejected"

    if ring == "soft":
        return "approved" if trust >= 0.4 else "rejected"

    # No ring
    if anomaly >= 0.6:
        return "approved" if trust >= 0.4 else "rejected"

    # No ring + anomaly < 0.6
    return "approved"  # trust >= 0.2 is guaranteed at this point
