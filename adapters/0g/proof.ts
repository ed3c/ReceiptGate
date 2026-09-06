import type { ProofEnvelope } from "../../core/verify";
import type { ZeroGOpaqueProof } from "./verifier";

/**
 * Wrap an official ServeProof + the exact HTTP transcript for ReceiptGate.
 * `candidateHash` is a legacy generic-envelope field used by the fixture
 * verifier; ZeroGProofVerifier deliberately ignores it and derives candidate
 * binding from the taskHash-covered response body instead.
 */
export function makeZeroGProofEnvelope(payload: ZeroGOpaqueProof): ProofEnvelope {
  const issuedAtMs = payload.serveProof.timestamp
    ? Number(payload.serveProof.timestamp) * 1_000
    : 0;
  const expiresAtMs = payload.serveProof.deadline
    ? Number(payload.serveProof.deadline) * 1_000
    : 0;

  return {
    source: "0g-agentic-id",
    candidateHash: "ignored-by-0g-verifier",
    issuedAtMs,
    expiresAtMs,
    opaque: payload,
  };
}
