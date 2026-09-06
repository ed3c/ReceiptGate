import type { PolicyDecision } from "./policy";
import type { VerificationResult } from "./verify";

export interface CandidateAction {
  id: string;
  kind: string;
  target: string;
  amount?: number;
  currency?: string;
  payload?: Record<string, unknown>;
}

export type ExecutionStatus = "blocked" | "executed" | "execution_failed";

export interface ExecutionReceipt {
  schema: "receiptgate-execution-v1";
  candidateId: string;
  candidateHash: string;
  verification: VerificationResult;
  policy: PolicyDecision;
  execution: {
    attempted: boolean;
    status: ExecutionStatus;
    error?: string;
  };
}
