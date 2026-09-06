import { sha256Hex } from "./hash";
import { evaluatePolicy, type GatePolicy } from "./policy";
import type { CandidateAction, ExecutionReceipt } from "./receipt";
import {
  type ProofEnvelope,
  type ProofVerifier,
  unavailableVerification,
} from "./verify";

export interface GateInput<T> {
  candidate: CandidateAction;
  proof: ProofEnvelope;
  verifier: ProofVerifier;
  policy: GatePolicy;
  execute: () => Promise<T>;
  nowMs?: number;
}

export async function executeWithReceipt<T>(input: GateInput<T>): Promise<ExecutionReceipt> {
  const nowMs = input.nowMs ?? Date.now();
  const candidateHash = sha256Hex(input.candidate);

  let verification;
  try {
    verification = await input.verifier.verify(input.proof, input.candidate, nowMs);
  } catch (error) {
    verification = unavailableVerification(input.proof.source || "unknown", error);
  }

  if (!verification.ok) {
    return {
      schema: "receiptgate-execution-v1",
      candidateId: input.candidate.id,
      candidateHash,
      verification,
      policy: { allowed: false, reasons: ["policy not evaluated because proof failed"] },
      execution: { attempted: false, status: "blocked" },
    };
  }

  const policy = evaluatePolicy(input.candidate, input.policy);
  if (!policy.allowed) {
    return {
      schema: "receiptgate-execution-v1",
      candidateId: input.candidate.id,
      candidateHash,
      verification,
      policy,
      execution: { attempted: false, status: "blocked" },
    };
  }

  try {
    await input.execute();
    return {
      schema: "receiptgate-execution-v1",
      candidateId: input.candidate.id,
      candidateHash,
      verification,
      policy,
      execution: { attempted: true, status: "executed" },
    };
  } catch (error) {
    return {
      schema: "receiptgate-execution-v1",
      candidateId: input.candidate.id,
      candidateHash,
      verification,
      policy,
      execution: {
        attempted: true,
        status: "execution_failed",
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
