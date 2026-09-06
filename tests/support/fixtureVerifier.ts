import { sha256Hex } from "../../core/hash";
import type { CandidateAction } from "../../core/receipt";
import type {
  ProofEnvelope,
  ProofVerifier,
  VerificationResult,
} from "../../core/verify";

export function makeFixtureProof(
  candidate: CandidateAction,
  nowMs: number,
  overrides: Partial<ProofEnvelope> = {},
): ProofEnvelope {
  return {
    source: "fixture-only-not-0g",
    candidateHash: sha256Hex(candidate),
    issuedAtMs: nowMs - 1_000,
    expiresAtMs: nowMs + 60_000,
    opaque: { fixtureAuthentic: true },
    ...overrides,
  };
}

export const fixtureVerifier: ProofVerifier = {
  async verify(
    proof: ProofEnvelope,
    candidate: CandidateAction,
    nowMs: number,
  ): Promise<VerificationResult> {
    const authenticity =
      typeof proof.opaque === "object" &&
      proof.opaque !== null &&
      (proof.opaque as { fixtureAuthentic?: boolean }).fixtureAuthentic === true;
    const candidateBinding = proof.candidateHash === sha256Hex(candidate);
    const freshness = proof.issuedAtMs <= nowMs && nowMs <= proof.expiresAtMs;

    const reasons: string[] = [];
    if (!authenticity) reasons.push("fixture authenticity flag failed");
    if (!candidateBinding) reasons.push("candidate binding mismatch");
    if (!freshness) reasons.push("proof is stale or not yet valid");

    return {
      ok: authenticity && candidateBinding && freshness,
      source: proof.source,
      checks: { authenticity, candidateBinding, freshness },
      reasons,
    };
  },
};
