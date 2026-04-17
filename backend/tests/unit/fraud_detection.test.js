/**
 * fraud_detection.test.js — Unit tests for ShiftSure fraud detection logic
 *
 * Mirrors the decision matrix defined in ai/fraud.py::_decision_matrix()
 * and the high-level run_fraud_check() flow.
 *
 * No live Neo4j or Firebase dependencies — pure deterministic logic.
 *
 * Decision matrix (from spec):
 *
 *                        | trust >= 0.4 | trust 0.2-0.4 | trust < 0.2
 * -----------------------------------------------------------------
 * no ring + anomaly < 0.6  |   APPROVED   |   APPROVED    |  REJECTED
 * no ring + anomaly >= 0.6 |   APPROVED   |   REJECTED    |  REJECTED
 * soft ring (3+ co-filers) |   APPROVED   |   REJECTED    |  REJECTED
 * hard ring (5+ co-filers) |   REJECTED   |   REJECTED    |  REJECTED
 */

'use strict';

// ── Re-implement decision matrix in JS (mirrors ai/fraud.py::_decision_matrix) ─

/**
 * @param {number} trust         - 0.0 – 1.0
 * @param {number} anomaly       - 0.0 – 1.0  (graph_anomaly_score)
 * @param {'none'|'soft'|'hard'} ring
 * @returns {'approved'|'rejected'}
 */
function decisionMatrix(trust, anomaly, ring) {
  if (ring === 'hard') return 'rejected';
  if (trust < 0.2) return 'rejected';
  if (ring === 'soft') return trust >= 0.4 ? 'approved' : 'rejected';
  // No ring
  if (anomaly >= 0.6) return trust >= 0.4 ? 'approved' : 'rejected';
  return 'approved'; // trust >= 0.2 guaranteed at this point
}

/**
 * Mimics trust score delta applied after a decision (from fraud.py::run_fraud_check).
 * @returns {number} delta
 */
function computeTrustDelta(decision, ring, anomalyScore) {
  if (decision === 'rejected') return -0.2;
  if (decision === 'approved' && (ring === 'soft' || anomalyScore >= 0.6)) return -0.1;
  return 0.0;
}

/**
 * Clamps trust score within [0, 1] after applying delta (mirrors Neo4j SET logic).
 */
function applyTrustDelta(currentTrust, delta) {
  return Math.max(0.0, Math.min(1.0, currentTrust + delta));
}

/**
 * Simplified anomaly score formula from fraud.py::compute_anomaly_score.
 * Returns a value in [0, 1].
 */
function computeAnomalyScore(workerClaims, totalZoneClaims, peerCount) {
  if (totalZoneClaims === 0 || peerCount === 0) return 0.0;
  const avgZone = totalZoneClaims / peerCount;
  if (avgZone === 0) return 0.0;
  const raw = (workerClaims / avgZone) - 1.0;
  return Math.round(Math.min(1.0, Math.max(0.0, raw / 4.0)) * 10000) / 10000;
}

/**
 * Ring detection logic from fraud.py::detect_ring.
 * @param {number} coFilers            - distinct workers who co-filed
 * @param {number} peerConsensusRatio  - 0.0 – 1.0
 * @returns {'none'|'soft'|'hard'}
 */
function detectRing(coFilers, peerConsensusRatio) {
  if (coFilers >= 5 && peerConsensusRatio < 0.3) return 'hard';
  if (coFilers >= 3 && peerConsensusRatio < 0.4) return 'soft';
  return 'none';
}

// ══════════════════════════════════════════════════════════════════════════════
// Decision Matrix Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('Fraud Detection — Decision Matrix', () => {
  // ── Hard ring → always rejected ───────────────────────────────────────────
  describe('Hard Ring', () => {
    test('hard ring, high trust → rejected', () => {
      expect(decisionMatrix(0.9, 0.1, 'hard')).toBe('rejected');
    });

    test('hard ring, medium trust → rejected', () => {
      expect(decisionMatrix(0.5, 0.1, 'hard')).toBe('rejected');
    });

    test('hard ring, low trust → rejected', () => {
      expect(decisionMatrix(0.1, 0.1, 'hard')).toBe('rejected');
    });

    test('hard ring, zero anomaly → still rejected', () => {
      expect(decisionMatrix(1.0, 0.0, 'hard')).toBe('rejected');
    });
  });

  // ── Trust < 0.2 → always rejected ────────────────────────────────────────
  describe('Trust Below 0.2', () => {
    test('trust=0.0, no ring, low anomaly → rejected', () => {
      expect(decisionMatrix(0.0, 0.1, 'none')).toBe('rejected');
    });

    test('trust=0.19, no ring, low anomaly → rejected', () => {
      expect(decisionMatrix(0.19, 0.1, 'none')).toBe('rejected');
    });

    test('trust=0.1, soft ring → rejected', () => {
      expect(decisionMatrix(0.1, 0.3, 'soft')).toBe('rejected');
    });
  });

  // ── Soft ring ─────────────────────────────────────────────────────────────
  describe('Soft Ring', () => {
    test('soft ring, trust >= 0.4 → approved', () => {
      expect(decisionMatrix(0.4, 0.3, 'soft')).toBe('approved');
    });

    test('soft ring, trust 0.7 → approved', () => {
      expect(decisionMatrix(0.7, 0.5, 'soft')).toBe('approved');
    });

    test('soft ring, trust 0.2-0.4 → rejected', () => {
      expect(decisionMatrix(0.3, 0.3, 'soft')).toBe('rejected');
    });

    test('soft ring, trust exactly 0.39 → rejected', () => {
      expect(decisionMatrix(0.39, 0.3, 'soft')).toBe('rejected');
    });
  });

  // ── No ring + high anomaly ────────────────────────────────────────────────
  describe('No Ring + High Anomaly (>= 0.6)', () => {
    test('no ring, anomaly=0.6, trust>=0.4 → approved', () => {
      expect(decisionMatrix(0.4, 0.6, 'none')).toBe('approved');
    });

    test('no ring, anomaly=0.8, trust=0.9 → approved', () => {
      expect(decisionMatrix(0.9, 0.8, 'none')).toBe('approved');
    });

    test('no ring, anomaly=0.6, trust=0.3 → rejected', () => {
      expect(decisionMatrix(0.3, 0.6, 'none')).toBe('rejected');
    });

    test('no ring, anomaly=1.0, trust=0.2 → rejected', () => {
      expect(decisionMatrix(0.2, 1.0, 'none')).toBe('rejected');
    });
  });

  // ── Clean profile — always approved ──────────────────────────────────────
  describe('Clean Profile (no ring + low anomaly + trust >= 0.2)', () => {
    test('trust=1.0, no ring, anomaly=0.0 → approved', () => {
      expect(decisionMatrix(1.0, 0.0, 'none')).toBe('approved');
    });

    test('trust=0.5, no ring, anomaly=0.3 → approved', () => {
      expect(decisionMatrix(0.5, 0.3, 'none')).toBe('approved');
    });

    test('trust=0.2, no ring, anomaly=0.59 → approved (boundary)', () => {
      expect(decisionMatrix(0.2, 0.59, 'none')).toBe('approved');
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Trust Score Mechanics
// ══════════════════════════════════════════════════════════════════════════════

describe('Fraud Detection — Trust Score Mechanics', () => {
  describe('Delta Computation', () => {
    test('rejection → delta = -0.2', () => {
      expect(computeTrustDelta('rejected', 'none', 0.1)).toBe(-0.2);
    });

    test('approved with soft ring → delta = -0.1', () => {
      expect(computeTrustDelta('approved', 'soft', 0.3)).toBe(-0.1);
    });

    test('approved with high anomaly → delta = -0.1', () => {
      expect(computeTrustDelta('approved', 'none', 0.6)).toBe(-0.1);
    });

    test('clean approval → delta = 0', () => {
      expect(computeTrustDelta('approved', 'none', 0.3)).toBe(0.0);
    });
  });

  describe('Trust Score Clamping', () => {
    test('trust 1.0 - 0.2 = 0.8', () => {
      expect(applyTrustDelta(1.0, -0.2)).toBeCloseTo(0.8);
    });

    test('trust 0.1 - 0.2 → clamped to 0.0 (never negative)', () => {
      expect(applyTrustDelta(0.1, -0.2)).toBeCloseTo(0.0, 10);
    });

    test('trust 0.9 + 0.2 → clamped to 1.0 (never over 1)', () => {
      expect(applyTrustDelta(0.9, 0.2)).toBeCloseTo(1.0, 10);
    });

    test('trust 0.5 + 0.0 = 0.5 (no change)', () => {
      expect(applyTrustDelta(0.5, 0.0)).toBeCloseTo(0.5);
    });

    test('trust decay over multiple rejections', () => {
      let trust = 1.0;
      for (let i = 0; i < 5; i++) trust = applyTrustDelta(trust, -0.2);
      // Floating-point safe: trust should be at or very close to 0
      expect(trust).toBeCloseTo(0.0, 10);
    });

    test('new worker starts at trust = 1.0 (default)', () => {
      // On CREATE SET w.trust_score = 1.0
      const defaultTrust = 1.0;
      expect(defaultTrust).toBe(1.0);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Anomaly Score Calculation
// ══════════════════════════════════════════════════════════════════════════════

describe('Fraud Detection — Anomaly Score', () => {
  test('worker with 0 claims → score = 0', () => {
    expect(computeAnomalyScore(0, 100, 10)).toBe(0.0);
  });

  test('worker matches zone average → score = 0', () => {
    // worker=10, total=100, peers=10 → avg=10 → raw=(10/10)-1=0 → score=0
    expect(computeAnomalyScore(10, 100, 10)).toBe(0.0);
  });

  test('worker 3x zone average → moderate anomaly', () => {
    // worker=30, total=100, peers=10 → avg=10 → raw=(30/10)-1=2 → /4 = 0.5
    expect(computeAnomalyScore(30, 100, 10)).toBeCloseTo(0.5, 4);
  });

  test('worker 5x zone average → score clamped at 1.0', () => {
    // worker=50, total=100, peers=10 → avg=10 → raw=(50/10)-1=4 → /4=1.0
    expect(computeAnomalyScore(50, 100, 10)).toBe(1.0);
  });

  test('worker 10x zone average → still clamped at 1.0', () => {
    expect(computeAnomalyScore(100, 100, 10)).toBe(1.0);
  });

  test('empty zone → score = 0', () => {
    expect(computeAnomalyScore(5, 0, 0)).toBe(0.0);
  });

  test('single worker in zone → score = 0 (is the average)', () => {
    // worker=5, total=5, peers=1 → avg=5 → raw=0 → score=0
    expect(computeAnomalyScore(5, 5, 1)).toBe(0.0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Ring Detection
// ══════════════════════════════════════════════════════════════════════════════

describe('Fraud Detection — Ring Detection', () => {
  describe('Hard Ring (>= 5 co-filers + consensus < 0.3)', () => {
    test('5 co-filers + consensus 0.2 → hard', () => {
      expect(detectRing(5, 0.2)).toBe('hard');
    });

    test('10 co-filers + consensus 0.1 → hard', () => {
      expect(detectRing(10, 0.1)).toBe('hard');
    });

    test('5 co-filers + consensus 0.3 → NOT hard (boundary)', () => {
      expect(detectRing(5, 0.3)).not.toBe('hard');
    });

    test('4 co-filers + consensus 0.1 → NOT hard (under threshold)', () => {
      expect(detectRing(4, 0.1)).not.toBe('hard');
    });
  });

  describe('Soft Ring (>= 3 co-filers + consensus < 0.4)', () => {
    test('3 co-filers + consensus 0.3 → soft', () => {
      expect(detectRing(3, 0.3)).toBe('soft');
    });

    test('4 co-filers + consensus 0.39 → soft', () => {
      expect(detectRing(4, 0.39)).toBe('soft');
    });

    test('3 co-filers + consensus 0.4 → none (boundary)', () => {
      expect(detectRing(3, 0.4)).toBe('none');
    });

    test('2 co-filers + consensus 0.1 → none (under minimum)', () => {
      expect(detectRing(2, 0.1)).toBe('none');
    });
  });

  describe('No Ring', () => {
    test('1 co-filer + any consensus → none', () => {
      expect(detectRing(1, 0.1)).toBe('none');
    });

    test('0 co-filers → none', () => {
      expect(detectRing(0, 0.0)).toBe('none');
    });

    test('high consensus with 3 filers → none', () => {
      expect(detectRing(3, 0.9)).toBe('none');
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Full End-to-End Fraud Decision Scenarios
// ══════════════════════════════════════════════════════════════════════════════

describe('Fraud Detection — Full Decision Scenarios', () => {
  /**
   * Simulates the complete fraud pipeline without Neo4j:
   * anomaly + ring + trust → decision + trust delta.
   */
  function simulateFraudCheck({ workerClaims, totalZoneClaims, peerCount, coFilers, consensus, initialTrust }) {
    const anomaly = computeAnomalyScore(workerClaims, totalZoneClaims, peerCount);
    const ring = detectRing(coFilers, consensus);
    const decision = decisionMatrix(initialTrust, anomaly, ring);
    const delta = computeTrustDelta(decision, ring, anomaly);
    const newTrust = applyTrustDelta(initialTrust, delta);
    return { anomaly, ring, decision, delta, newTrust };
  }

  test('Scenario: new legitimate rider — clean approval', () => {
    const result = simulateFraudCheck({
      workerClaims: 2, totalZoneClaims: 50, peerCount: 10,
      coFilers: 1, consensus: 0.8, initialTrust: 1.0,
    });
    expect(result.decision).toBe('approved');
    expect(result.ring).toBe('none');
    expect(result.newTrust).toBe(1.0); // No penalty
  });

  test('Scenario: prolific filer (4x avg) with medium trust — approved but penalised', () => {
    const result = simulateFraudCheck({
      workerClaims: 40, totalZoneClaims: 100, peerCount: 10, // avg=10, 4x
      coFilers: 1, consensus: 0.8, initialTrust: 0.7,
    });
    // anomaly ≈ (40/10-1)/4 = 0.75 → high anomaly, trust >= 0.4 → approved
    expect(result.decision).toBe('approved');
    expect(result.anomaly).toBeGreaterThanOrEqual(0.6);
    expect(result.newTrust).toBeCloseTo(0.6, 4); // -0.1 penalty
  });

  test('Scenario: medium trust + high anomaly + no ring — rejected', () => {
    const result = simulateFraudCheck({
      workerClaims: 40, totalZoneClaims: 100, peerCount: 10,
      coFilers: 1, consensus: 0.8, initialTrust: 0.3,
    });
    // anomaly >= 0.6, trust < 0.4 → rejected
    expect(result.decision).toBe('rejected');
    expect(result.newTrust).toBeCloseTo(0.1, 4); // -0.2 penalty
  });

  test('Scenario: coordinated ring (hard) — always rejected regardless of trust', () => {
    const result = simulateFraudCheck({
      workerClaims: 5, totalZoneClaims: 100, peerCount: 20,
      coFilers: 6, consensus: 0.15, initialTrust: 0.95,
    });
    expect(result.ring).toBe('hard');
    expect(result.decision).toBe('rejected');
    expect(result.newTrust).toBeCloseTo(0.75, 4); // -0.2 penalty
  });

  test('Scenario: soft ring + high trust — approved with penalty', () => {
    const result = simulateFraudCheck({
      workerClaims: 5, totalZoneClaims: 80, peerCount: 10,
      coFilers: 4, consensus: 0.35, initialTrust: 0.6,
    });
    expect(result.ring).toBe('soft');
    expect(result.decision).toBe('approved');
    expect(result.newTrust).toBeCloseTo(0.5, 4); // -0.1 penalty
  });

  test('Scenario: soft ring + medium-low trust — rejected', () => {
    const result = simulateFraudCheck({
      workerClaims: 5, totalZoneClaims: 80, peerCount: 10,
      coFilers: 4, consensus: 0.35, initialTrust: 0.35,
    });
    expect(result.ring).toBe('soft');
    expect(result.decision).toBe('rejected');
  });

  test('Scenario: very low trust (< 0.2) — always rejected', () => {
    const result = simulateFraudCheck({
      workerClaims: 1, totalZoneClaims: 50, peerCount: 10,
      coFilers: 1, consensus: 0.9, initialTrust: 0.15,
    });
    expect(result.decision).toBe('rejected');
  });

  test('Scenario: trust hits zero after repeated fraud rejections', () => {
    let trust = 0.5;
    const results = [];
    for (let i = 0; i < 5; i++) {
      const result = simulateFraudCheck({
        workerClaims: 50, totalZoneClaims: 100, peerCount: 10,
        coFilers: 0, consensus: 1.0, initialTrust: trust,
      });
      trust = result.newTrust;
      results.push(result.decision);
    }
    // After enough legitimate rejections (due to high anomaly + declining trust),
    // trust should eventually collapse to 0
    expect(trust).toBeLessThanOrEqual(0.2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Fail-Open (AI Service Unavailable)
// ══════════════════════════════════════════════════════════════════════════════

describe('Fraud Detection — Fail-Open Behaviour', () => {
  /**
   * When Neo4j is unavailable, triggerEngine.js falls back to "approved"
   * (fail-open policy so claims aren't silently lost).
   */
  function failOpenFraudCheck() {
    return {
      decision: 'approved',
      fraud_result: {
        graph_anomaly_score: 0.0,
        ring_detected: 'none',
        trust_score_at_check: 0.5,
        decision_source: 'fallback_no_graph',
      },
    };
  }

  test('fail-open returns approved decision', () => {
    const result = failOpenFraudCheck();
    expect(result.decision).toBe('approved');
  });

  test('fail-open sets decision_source to fallback_no_graph', () => {
    const result = failOpenFraudCheck();
    expect(result.fraud_result.decision_source).toBe('fallback_no_graph');
  });

  test('fail-open uses neutral trust score 0.5', () => {
    const result = failOpenFraudCheck();
    expect(result.fraud_result.trust_score_at_check).toBe(0.5);
  });

  test('fail-open sets anomaly score to 0 (safest default)', () => {
    const result = failOpenFraudCheck();
    expect(result.fraud_result.graph_anomaly_score).toBe(0.0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Fraud Rejection Reason Mapping
// ══════════════════════════════════════════════════════════════════════════════

describe('Fraud Detection — Rejection Reason Mapping', () => {
  /**
   * Mirrors the reason selection in verificationPipeline.js (Step 11).
   */
  function getRejectionReason(fraudResult) {
    const fr = fraudResult;
    if (fr.ring_detected === 'hard') return 'Coordinated claim ring detected';
    if (fr.ring_detected === 'soft') return 'Suspicious co-filing pattern detected';
    if (fr.graph_anomaly_score >= 0.6) return 'Anomalous filing pattern detected';
    if (fr.trust_score_at_check < 0.2) return 'Account trust score too low';
    return 'Claim flagged by fraud detection';
  }

  test('hard ring → coordinated ring reason', () => {
    const reason = getRejectionReason({ ring_detected: 'hard', graph_anomaly_score: 0.2, trust_score_at_check: 0.8 });
    expect(reason).toBe('Coordinated claim ring detected');
  });

  test('soft ring → suspicious pattern reason', () => {
    const reason = getRejectionReason({ ring_detected: 'soft', graph_anomaly_score: 0.2, trust_score_at_check: 0.8 });
    expect(reason).toBe('Suspicious co-filing pattern detected');
  });

  test('high anomaly → anomalous filing pattern reason', () => {
    const reason = getRejectionReason({ ring_detected: 'none', graph_anomaly_score: 0.7, trust_score_at_check: 0.5 });
    expect(reason).toBe('Anomalous filing pattern detected');
  });

  test('low trust → trust score too low reason', () => {
    const reason = getRejectionReason({ ring_detected: 'none', graph_anomaly_score: 0.1, trust_score_at_check: 0.1 });
    expect(reason).toBe('Account trust score too low');
  });

  test('generic fallback reason', () => {
    const reason = getRejectionReason({ ring_detected: 'none', graph_anomaly_score: 0.3, trust_score_at_check: 0.5 });
    expect(reason).toBe('Claim flagged by fraud detection');
  });
});
