import type { CandidateAction } from "./receipt";

export interface GatePolicy {
  maxAmount?: number;
  allowedKinds?: string[];
}

export interface PolicyDecision {
  allowed: boolean;
  reasons: string[];
}

export function evaluatePolicy(candidate: CandidateAction, policy: GatePolicy): PolicyDecision {
  const reasons: string[] = [];

  if (policy.allowedKinds && !policy.allowedKinds.includes(candidate.kind)) {
    reasons.push(`action kind ${candidate.kind} is not allowed`);
  }

  if (policy.maxAmount !== undefined) {
    if (!Number.isFinite(policy.maxAmount) || policy.maxAmount < 0) {
      reasons.push("policy maxAmount is invalid");
    } else if (candidate.amount === undefined || !Number.isFinite(candidate.amount)) {
      reasons.push("candidate amount is missing or invalid");
    } else if (candidate.amount > policy.maxAmount) {
      reasons.push(`candidate amount ${candidate.amount} exceeds max ${policy.maxAmount}`);
    }
  }

  return { allowed: reasons.length === 0, reasons };
}
