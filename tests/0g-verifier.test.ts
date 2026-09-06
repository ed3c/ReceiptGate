import { describe, expect, test } from "bun:test";
import { executeWithReceipt } from "../core/gate";
import type { CandidateAction } from "../core/receipt";
import { makeZeroGProofEnvelope } from "../adapters/0g/proof";
import { computeZeroGTaskHash, type ZeroGTranscript } from "../adapters/0g/taskHash";
import {
  ZeroGProofVerifier,
  type ZeroGReputationVerifier,
  type ZeroGSdkVerification,
  type ZeroGServeProofLike,
} from "../adapters/0g/verifier";

const NOW = 1_800_000_000_000;

function candidate(amount = 247): CandidateAction {
  return {
    id: "purchase-001",
    kind: "purchase",
    target: "gpu-credits",
    amount,
    currency: "USD",
    payload: { units: 10_000 },
  };
}

function transcriptFor(value: CandidateAction): ZeroGTranscript {
  return {
    method: "POST",
    requestUri: "/api/evaluate",
    requestBody: JSON.stringify({ budget: 300, units: 10_000 }),
    responseBody: JSON.stringify(value),
    statusCode: 200,
  };
}

function serveProofFor(transcript: ZeroGTranscript): ZeroGServeProofLike {
  return {
    taskHash: computeZeroGTaskHash(transcript),
    timestamp: BigInt(Math.floor(NOW / 1_000) - 1),
    deadline: BigInt(Math.floor(NOW / 1_000) + 3_600),
  };
}

const sdkPass: ZeroGSdkVerification = {
  ok: true,
  signerMatches: true,
  notExpired: true,
  dataOnChain: true,
  reasons: [],
};

function sdk(result: ZeroGSdkVerification = sdkPass): ZeroGReputationVerifier {
  return { async verifyProof() { return result; } };
}

const extractCandidate = (body: string): CandidateAction => JSON.parse(body) as CandidateAction;

describe("0G Agentic ID adapter", () => {
  test("official verification + transcript + extracted candidate all match", async () => {
    const expected = candidate();
    const transcript = transcriptFor(expected);
    const proof = makeZeroGProofEnvelope({ serveProof: serveProofFor(transcript), transcript });
    const verifier = new ZeroGProofVerifier(sdk(), extractCandidate);

    const result = await verifier.verify(proof, expected, NOW);

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual({
      authenticity: true,
      candidateBinding: true,
      freshness: true,
    });
  });

  test("response body tamper breaks taskHash binding", async () => {
    const approved = candidate(247);
    const originalTranscript = transcriptFor(approved);
    const signedProof = serveProofFor(originalTranscript);
    const tamperedTranscript = { ...originalTranscript, responseBody: JSON.stringify(candidate(2_470)) };
    const proof = makeZeroGProofEnvelope({ serveProof: signedProof, transcript: tamperedTranscript });
    const verifier = new ZeroGProofVerifier(sdk(), extractCandidate);

    const result = await verifier.verify(proof, candidate(2_470), NOW);

    expect(result.ok).toBe(false);
    expect(result.checks.candidateBinding).toBe(false);
    expect(result.reasons).toContain("0G taskHash does not match request/response transcript");
  });

  test("candidate cannot differ from the taskHash-covered response body", async () => {
    const signedCandidate = candidate(247);
    const transcript = transcriptFor(signedCandidate);
    const proof = makeZeroGProofEnvelope({ serveProof: serveProofFor(transcript), transcript });
    const verifier = new ZeroGProofVerifier(sdk(), extractCandidate);

    const result = await verifier.verify(proof, candidate(248), NOW);

    expect(result.ok).toBe(false);
    expect(result.checks.candidateBinding).toBe(false);
    expect(result.reasons).toContain("candidate differs from signed response body");
  });

  test("official signer/data/freshness failure blocks", async () => {
    const expected = candidate();
    const transcript = transcriptFor(expected);
    const proof = makeZeroGProofEnvelope({ serveProof: serveProofFor(transcript), transcript });
    const verifier = new ZeroGProofVerifier(
      sdk({
        ok: false,
        signerMatches: false,
        notExpired: true,
        dataOnChain: true,
        reasons: ["signature does not match the on-chain agentSeal"],
      }),
      extractCandidate,
    );

    const result = await verifier.verify(proof, expected, NOW);

    expect(result.ok).toBe(false);
    expect(result.checks.authenticity).toBe(false);
  });

  test("official verifier exception still leaves side effect unreachable", async () => {
    const expected = candidate();
    const transcript = transcriptFor(expected);
    const proof = makeZeroGProofEnvelope({ serveProof: serveProofFor(transcript), transcript });
    const verifier = new ZeroGProofVerifier(
      { async verifyProof() { throw new Error("0G RPC unavailable"); } },
      extractCandidate,
    );
    let calls = 0;

    const receipt = await executeWithReceipt({
      candidate: expected,
      proof,
      verifier,
      policy: { maxAmount: 300 },
      nowMs: NOW,
      execute: async () => { calls += 1; },
    });

    expect(calls).toBe(0);
    expect(receipt.verification.ok).toBe(false);
    expect(receipt.execution.status).toBe("blocked");
    expect(receipt.verification.reasons[0]).toContain("0G RPC unavailable");
  });
});
