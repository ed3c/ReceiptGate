import { executeWithReceipt } from "../core/gate";
import { sha256Hex } from "../core/hash";
import type { CandidateAction } from "../core/receipt";
import type { ProofEnvelope, ProofVerifier } from "../core/verify";

function baseCandidate(amount = 247): CandidateAction {
  return {
    id: "hackathon-gpu-credits-001",
    kind: "purchase",
    target: "0G GPU inference credits",
    amount,
    currency: "USD",
    payload: { units: 10_000, product: "GPU inference credits" },
  };
}

function makeDemoProof(candidate: CandidateAction, nowMs: number): ProofEnvelope {
  return {
    source: "fixture-demo-candidate-binding",
    candidateHash: sha256Hex(candidate),
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + 60_000,
    opaque: { fixtureAuthentic: true },
  };
}

const demoVerifier: ProofVerifier = {
  async verify(proof, candidate, nowMs) {
    const opaque = (proof.opaque ?? {}) as { fixtureAuthentic?: boolean };
    const authenticity = opaque.fixtureAuthentic === true;
    const candidateBinding = proof.candidateHash === sha256Hex(candidate);
    const freshness = proof.issuedAtMs <= nowMs && proof.expiresAtMs > nowMs;
    const reasons: string[] = [];
    if (!authenticity) reasons.push("fixture proof authenticity control failed");
    if (!candidateBinding) reasons.push("candidate differs from the proof-bound value");
    if (!freshness) reasons.push("fixture proof is stale");
    return {
      ok: authenticity && candidateBinding && freshness,
      source: proof.source,
      checks: { authenticity, candidateBinding, freshness },
      reasons,
    };
  },
};

export async function runFixtureScenario(tamper: boolean) {
  const nowMs = Date.now();
  const approved = baseCandidate(247);
  const proof = makeDemoProof(approved, nowMs);
  const candidate = tamper ? baseCandidate(2_470) : approved;
  let sideEffectCalls = 0;

  const receipt = await executeWithReceipt({
    candidate,
    proof,
    verifier: demoVerifier,
    policy: { maxAmount: 300, allowedKinds: ["purchase"] },
    nowMs,
    execute: async () => {
      sideEffectCalls += 1;
    },
  });

  return {
    schema: "receiptgate-judge-demo-v1",
    mode: "fixture",
    tamper,
    approvedAmount: 247,
    displayedAmount: candidate.amount,
    policy: { maxAmount: 300, currency: "USD" },
    proofBoundary: "fixture-candidate-binding-only-not-0g",
    candidate,
    receipt,
    sideEffectCalls,
  };
}
