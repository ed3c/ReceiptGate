import type { CandidateAction } from "./receipt";

export interface ProofEnvelope {
  source: string;
  candidateHash: string;
  issuedAtMs: number;
  expiresAtMs: number;
  opaque?: unknown;
}

export interface VerificationResult {
  ok: boolean;
  source: string;
  checks: {
    authenticity: boolean;
    candidateBinding: boolean;
    freshness: boolean;
  };
  reasons: string[];
}

export interface ProofVerifier {
  verify(
    proof: ProofEnvelope,
    candidate: CandidateAction,
    nowMs: number,
  ): Promise<VerificationResult>;
}

export function unavailableVerification(source: string, error: unknown): VerificationResult {
  return {
    ok: false,
    source,
    checks: {
      authenticity: false,
      candidateBinding: false,
      freshness: false,
    },
    reasons: [
      `verifier unavailable: ${error instanceof Error ? error.message : String(error)}`,
    ],
  };
}
