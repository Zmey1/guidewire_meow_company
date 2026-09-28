"""
AI service safety tests — no Neo4j required.
Run: pip install -r requirements.txt pytest && pytest -q
"""

import importlib
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

TOKEN = "test-internal-token"
FRAUD_BODY = {
    "worker_id": "w1",
    "zone_id": "z1",
    "trigger_event_id": "t1",
    "claim_id": "c1",
    "trigger_type": "flood",
    "peer_consensus_ratio": 0.8,
    "payout_amount": 400,
}


def load_app(monkeypatch, token):
    """Reload main so the module-level AI_SERVICE_TOKEN is re-read."""
    if token is None:
        monkeypatch.delenv("AI_SERVICE_TOKEN", raising=False)
    else:
        monkeypatch.setenv("AI_SERVICE_TOKEN", token)
    import main
    return importlib.reload(main)


@pytest.fixture
def main_mod(monkeypatch):
    return load_app(monkeypatch, TOKEN)


@pytest.fixture
def client(main_mod):
    return TestClient(main_mod.app)


AUTH = {"X-Internal-Token": TOKEN}


def test_health_is_public(client):
    assert client.get("/health").status_code == 200


def test_rejects_missing_token(client):
    assert client.post("/fraud-check", json=FRAUD_BODY).status_code == 401


def test_rejects_wrong_token(client):
    r = client.post("/fraud-check", json=FRAUD_BODY, headers={"X-Internal-Token": "nope"})
    assert r.status_code == 401


@pytest.mark.parametrize("exc", [RuntimeError("NEO4J_URI not set"), ConnectionError("unreachable"), ValueError("bad row")])
def test_fraud_check_fails_safe_to_pending_review(client, main_mod, monkeypatch, exc):
    def boom(**_kwargs):
        raise exc

    monkeypatch.setattr(main_mod.fraud_service, "run_fraud_check", boom)
    r = client.post("/fraud-check", json=FRAUD_BODY, headers=AUTH)

    assert r.status_code == 200
    body = r.json()
    assert body["decision"] == "pending_review"
    assert body["fraud_result"]["decision_source"] == "fallback_no_graph"


def test_fraud_check_passes_graph_verdict_through(client, main_mod, monkeypatch):
    monkeypatch.setattr(main_mod.fraud_service, "run_fraud_check", lambda **_: {
        "decision": "approved",
        "fraud_result": {"graph_anomaly_score": 0.1, "ring_detected": "none",
                         "trust_score_at_check": 0.9, "decision_source": "matrix"},
    })
    r = client.post("/fraud-check", json=FRAUD_BODY, headers=AUTH)
    assert r.json()["decision"] == "approved"


def test_no_token_configured_leaves_service_open(monkeypatch):
    """Local dev convenience; production must set AI_SERVICE_TOKEN (deploy workflow does)."""
    mod = load_app(monkeypatch, None)
    monkeypatch.setattr(mod.fraud_service, "run_fraud_check", lambda **_: (_ for _ in ()).throw(RuntimeError("x")))
    r = TestClient(mod.app).post("/fraud-check", json=FRAUD_BODY)
    assert r.status_code == 200
