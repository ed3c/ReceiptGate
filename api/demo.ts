type Candidate = {
  id: string;
  kind: string;
  target: string;
  amount: number;
  currency: string;
  payload: Record<string, unknown>;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function candidate(amount: number): Candidate {
  return {
    id: "hackathon-gpu-credits-001",
    kind: "purchase",
    target: "0G GPU inference credits",
    amount,
    currency: "USD",
    payload: { units: 10_000, product: "GPU inference credits" },
  };
}

function evaluatePolicy(action: Candidate) {
  const reasons: string[] = [];
  if (action.kind !== "purchase") reasons.push(`action kind ${action.kind} is not allowed`);
  if (!Number.isFinite(action.amount)) reasons.push("candidate amount is missing or invalid");
  else if (action.amount > 300) reasons.push(`candidate amount ${action.amount} exceeds max 300`);
  return { allowed: reasons.length === 0, reasons };
}

export async function runVercelFixtureScenario(tamper: boolean, nowMs = Date.now()) {
  const approved = candidate(247);
  const approvedHash = await sha256Hex(approved);
  const action = tamper ? candidate(2_470) : approved;
  const actionHash = await sha256Hex(action);

  const authenticity = true;
  const candidateBinding = approvedHash === actionHash;
  const freshness = true;
  const verificationReasons: string[] = [];
  if (!authenticity) verificationReasons.push("fixture proof authenticity control failed");
  if (!candidateBinding) verificationReasons.push("candidate differs from the proof-bound value");
  if (!freshness) verificationReasons.push("fixture proof is stale");
  const verification = {
    ok: authenticity && candidateBinding && freshness,
    source: "fixture-demo-candidate-binding",
    checks: { authenticity, candidateBinding, freshness },
    reasons: verificationReasons,
  };

  let sideEffectCalls = 0;
  let policy;
  let execution;

  if (!verification.ok) {
    policy = { allowed: false, reasons: ["policy not evaluated because proof failed"] };
    execution = { attempted: false, status: "blocked" as const };
  } else {
    policy = evaluatePolicy(action);
    if (!policy.allowed) {
      execution = { attempted: false, status: "blocked" as const };
    } else {
      sideEffectCalls += 1;
      execution = { attempted: true, status: "executed" as const };
    }
  }

  const receipt = {
    schema: "receiptgate-execution-v1",
    candidateId: action.id,
    candidateHash: actionHash,
    verification,
    policy,
    execution,
  };

  return {
    schema: "receiptgate-judge-demo-v1",
    mode: "fixture",
    tamper,
    approvedAmount: 247,
    displayedAmount: action.amount,
    policy: { maxAmount: 300, currency: "USD" },
    proofBoundary: "fixture-candidate-binding-only-not-0g",
    candidate: action,
    receipt,
    sideEffectCalls,
    runtimeBoundary: "vercel-self-contained-adapter-differentially-tested-against-core",
    nowMs,
  };
}

export default {
  async fetch(request: Request) {
    try {
      const body = (await request.json().catch(() => ({}))) as { tamper?: boolean };
      return Response.json(await runVercelFixtureScenario(body.tamper === true), {
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ error: message.slice(0, 400) }, { status: 503 });
    }
  },
};
