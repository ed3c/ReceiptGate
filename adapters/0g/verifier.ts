import { sha256Hex } from "../../core/hash";
import type { CandidateAction } from "../../core/receipt";
import type {
  ProofEnvelope,
  ProofVerifier,
  VerificationResult,
} from "../../core/verify";
import { computeZeroGTaskHash, type ZeroGTranscript } from "./taskHash";

export interface ZeroGServeProofLike {
  taskHash: `0x${string}`;
  timestamp?: bigint;
  deadline?: bigint;
  [key: string]: unknown;
}

export interface ZeroGSdkVerification {
  ok: boolean;
  signerMatches: boolean;
  notExpired: boolean;
  dataOnChain: boolean;
  reasons: string[];
}

export interface ZeroGReputationVerifier {
  verifyProof(proof: ZeroGServeProofLike): Promise<ZeroGSdkVerification>;
}

export interface ZeroGOpaqueProof {
  serveProof: ZeroGServeProofLike;
  transcript: ZeroGTranscript;
}

export type CandidateExtractor = (responseBody: string) => CandidateAction;

function decodeBody(body: string | Uint8Array): string {
  return typeof body === "string" ? body : new TextDecoder().decode(body);
}

function malformed(reason: string, source = "0g-agentic-id"): VerificationResult {
  return {
    ok: false,
    source,
    checks: {
      authenticity: false,
      candidateBinding: false,
      freshness: false,
    },
    reasons: [reason],
  };
}

/**
 * Joins two separate trust facts:
 * 1. official SDK: signer identity, expiry, and declared on-chain data roots;
 * 2. upstream taskHash: exact request/response transcript integrity.
 *
 * Candidate binding is derived from the response body covered by taskHash.
 * proof.candidateHash is intentionally ignored for this provider.
 */
export class ZeroGProofVerifier implements ProofVerifier {
  constructor(
    private readonly reputation: ZeroGReputationVerifier,
    private readonly extractCandidate: CandidateExtractor,
  ) {}

  async verify(
    proof: ProofEnvelope,
    candidate: CandidateAction,
    _nowMs: number,
  ): Promise<VerificationResult> {
    if (!proof.opaque || typeof proof.opaque !== "object") {
      return malformed("missing 0G proof payload", proof.source);
    }

    const opaque = proof.opaque as Partial<ZeroGOpaqueProof>;
    if (!opaque.serveProof || !opaque.transcript) {
      return malformed("missing ServeProof or transcript", proof.source);
    }

    const sdk = await this.reputation.verifyProof(opaque.serveProof);
    const computedTaskHash = computeZeroGTaskHash(opaque.transcript);
    const transcriptMatches =
      computedTaskHash.toLowerCase() === opaque.serveProof.taskHash.toLowerCase();

    let extractedMatches = false;
    let extractionReason: string | undefined;
    try {
      const extracted = this.extractCandidate(decodeBody(opaque.transcript.responseBody));
      extractedMatches = sha256Hex(extracted) === sha256Hex(candidate);
      if (!extractedMatches) extractionReason = "candidate differs from signed response body";
    } catch (error) {
      extractionReason = `candidate extraction failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    const candidateBinding = transcriptMatches && extractedMatches;
    const authenticity = sdk.signerMatches && sdk.dataOnChain;
    const freshness = sdk.notExpired;
    const reasons = [...sdk.reasons];

    if (!transcriptMatches) reasons.push("0G taskHash does not match request/response transcript");
    if (extractionReason) reasons.push(extractionReason);

    return {
      ok: sdk.ok && candidateBinding,
      source: proof.source,
      checks: { authenticity, candidateBinding, freshness },
      reasons,
    };
  }
}
