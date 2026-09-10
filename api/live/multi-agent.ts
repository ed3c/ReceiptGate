import { executeWithReceipt } from "../../core/gate";
import { computeZeroGTaskHash, type ZeroGTranscript } from "../../adapters/0g/taskHash";
import { classifyComputeTransport } from "../../adapters/0g/compute/transport";
export { classifyComputeTransport } from "../../adapters/0g/compute/transport";

type Candidate = {
  id: string;
  kind: "purchase";
  target: string;
  amount: number;
  currency: "USD";
  payload: {
    product: string;
    units: number;
    quotedPrice: number;
    sourceRisk: "low" | "medium" | "high";
    sourceReason: string;
    computeModel: string;
  };
};

type RiskReview = {
  candidateHash: string;
  verdict: "ALLOW" | "DENY";
  risk: "low" | "medium" | "high";
  reason: string;
};

type ServeProofGate = {
  configured: boolean;
  required: boolean;
  verified: boolean;
  reason?: string;
  servicePath?: string;
  responseStatus?: number;
  responseCandidateHash?: string | null;
  responseBinding?: boolean;
  transcriptBinding?: boolean;
  proof?: {
    agentId: string | null;
    submitter: string | null;
    timestamp: string | null;
    deadline: string | null;
    taskHash: string | null;
    dataHashes: string[];
    frameworkHash: string | null;
    signaturePresent: boolean;
  } | null;
  verification?: {
    ok: boolean;
    signerMatches?: boolean;
    notExpired?: boolean;
    dataOnChain?: boolean;
    reasons?: string[];
  } | null;
};

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/app-sk-[A-Za-z0-9._-]+/g, "[redacted-api-secret]")
    .replace(/\bsk-[A-Za-z0-9._-]+/g, "[redacted-api-secret]")
    .replace(/0x[a-fA-F0-9]{64}/g, "[redacted-private-material]")
    .slice(0, 500);
}

function validAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function walletAllowed(address: string): boolean {
  const configured = process.env.DEMO_ALLOWED_WALLETS?.trim();
  if (!configured) return true;
  return configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => validAddress(value))
    .includes(address.toLowerCase());
}


export function chatCompletionsUrl(serviceUrl: string): string {
  const base = serviceUrl.replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  if (base.endsWith("/v1/proxy") || base.endsWith("/v1")) return `${base}/chat/completions`;
  return `${base}/v1/proxy/chat/completions`;
}

function exactObject(value: unknown, keys: string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be a JSON object`);
  const row = value as Record<string, unknown>;
  const actual = Object.keys(row).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${name} must contain exactly: ${keys.join(", ")}`);
  }
  return row;
}

function parseStrictJson(content: unknown, name: string): unknown {
  if (typeof content !== "string" || !content.trim()) throw new Error(`${name} returned empty/non-string content`);
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`${name} must return strict JSON with no prose or code fence`);
  }
}

export function parseProcurement(content: unknown): {
  target: string;
  amount: number;
  currency: "USD";
  risk: RiskReview["risk"];
  reason: string;
} {
  const row = exactObject(parseStrictJson(content, "ProcurementAgent"), ["target", "totalPriceUsd", "currency", "risk", "reason"], "ProcurementAgent decision");
  if (typeof row.target !== "string" || !row.target.trim()) throw new Error("ProcurementAgent target is missing");
  if (typeof row.totalPriceUsd !== "number" || !Number.isFinite(row.totalPriceUsd) || row.totalPriceUsd <= 0) throw new Error("ProcurementAgent totalPriceUsd must be a finite positive number");
  if (row.currency !== "USD") throw new Error("ProcurementAgent currency must be USD");
  if (row.risk !== "low" && row.risk !== "medium" && row.risk !== "high") throw new Error("ProcurementAgent risk must be low, medium, or high");
  if (typeof row.reason !== "string" || !row.reason.trim()) throw new Error("ProcurementAgent reason is missing");
  return {
    target: row.target.trim(),
    amount: row.totalPriceUsd,
    currency: "USD" as const,
    risk: row.risk,
    reason: row.reason.trim(),
  };
}

function parseRiskReview(content: unknown): RiskReview {
  const row = exactObject(parseStrictJson(content, "RiskAgent"), ["candidateHash", "verdict", "risk", "reason"], "RiskAgent review");
  if (typeof row.candidateHash !== "string" || !/^0x[0-9a-f]{64}$/i.test(row.candidateHash)) throw new Error("RiskAgent candidateHash must be a 32-byte hex hash");
  if (row.verdict !== "ALLOW" && row.verdict !== "DENY") throw new Error("RiskAgent verdict must be ALLOW or DENY");
  if (row.risk !== "low" && row.risk !== "medium" && row.risk !== "high") throw new Error("RiskAgent risk must be low, medium, or high");
  if (typeof row.reason !== "string" || !row.reason.trim()) throw new Error("RiskAgent reason is missing");
  return {
    candidateHash: row.candidateHash.toLowerCase(),
    verdict: row.verdict,
    risk: row.risk,
    reason: row.reason.trim(),
  };
}

function canonicalCandidate(candidate: Candidate): string {
  return JSON.stringify({
    id: candidate.id,
    kind: candidate.kind,
    target: candidate.target,
    amount: candidate.amount,
    currency: candidate.currency,
    payload: {
      product: candidate.payload.product,
      units: candidate.payload.units,
      quotedPrice: candidate.payload.quotedPrice,
      sourceRisk: candidate.payload.sourceRisk,
      sourceReason: candidate.payload.sourceReason,
      computeModel: candidate.payload.computeModel,
    },
  });
}

export async function candidateHash(candidate: Candidate): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalCandidate(candidate));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return "0x" + Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function evaluateHandoff(input: {
  originalHash: string;
  transmittedHash: string;
  review: RiskReview;
  candidate: Candidate;
}) {
  const reasons: string[] = [];
  const hashPreserved = input.originalHash.toLowerCase() === input.transmittedHash.toLowerCase();
  const reviewerBound = input.review.candidateHash.toLowerCase() === input.transmittedHash.toLowerCase();
  const handoffBound = hashPreserved && reviewerBound;

  if (!hashPreserved) reasons.push("candidate hash changed between ProcurementAgent and RiskAgent");
  if (!reviewerBound) reasons.push("RiskAgent review is not bound to its received candidate hash");
  if (input.candidate.kind !== "purchase") reasons.push("candidate kind is not purchase");
  if (!Number.isFinite(input.candidate.amount) || input.candidate.amount <= 0) reasons.push("candidate amount is invalid");
  if (input.candidate.amount > 300) reasons.push(`candidate amount ${input.candidate.amount} exceeds max 300`);
  if (input.candidate.currency !== "USD") reasons.push("candidate currency is not USD");
  if (input.review.verdict !== "ALLOW") reasons.push("RiskAgent advisory verdict is not ALLOW");
  if (input.review.risk === "high") reasons.push("RiskAgent advisory risk is high");

  const allowed = handoffBound && reasons.length === 0;
  return {
    handoff: {
      fromHash: input.originalHash,
      toHash: input.transmittedHash,
      reviewerHash: input.review.candidateHash,
      hashPreserved,
      reviewerBound,
      bound: handoffBound,
    },
    policy: {
      allowed,
      reasons,
      rules: {
        maxAmountUsd: 300,
        currency: "USD",
        riskVerdictRequired: "ALLOW",
        highRiskDenied: true,
      },
    },
    execution: {
      status: allowed ? "executed" : "blocked",
      sideEffectCalls: allowed ? 1 : 0,
      sideEffect: "receiptgate-demo-purchase-executor",
      financialSettlement: false,
    },
  };
}

export function applyServeProofGate<T extends ReturnType<typeof evaluateHandoff>>(decision: T, serveProof: Pick<ServeProofGate, "required" | "verified" | "reason">): T {
  const rules = { ...decision.policy.rules, serveProofRequired: true } as T["policy"]["rules"];
  if (serveProof.required === true && serveProof.verified === true) {
    return {
      ...decision,
      policy: { ...decision.policy, rules },
    } as T;
  }

  const reasons = [...decision.policy.reasons, serveProof.reason || "candidate-bound Agentic ID ServeProof verification failed"];
  return {
    ...decision,
    policy: { ...decision.policy, allowed: false, reasons, rules },
    execution: { ...decision.execution, status: "blocked", sideEffectCalls: 0 },
  } as T;
}

export async function executeVerifiedHandoff(
  candidate: Candidate,
  baseDecision: ReturnType<typeof evaluateHandoff>,
  serveProof: Pick<ServeProofGate, "required" | "verified" | "reason">,
) {
  const decision = applyServeProofGate(baseDecision, serveProof);
  let sideEffectCalls = 0;
  const receipt = await executeWithReceipt({
    candidate,
    proof: { source: "0g-agentic-id", candidateHash: await candidateHash(candidate), issuedAtMs: 0, expiresAtMs: 0 },
    verifier: { async verify() {
      return {
        ok: decision.policy.allowed,
        source: "0g-agentic-id",
        checks: { authenticity: serveProof.verified, candidateBinding: serveProof.verified && baseDecision.handoff.bound, freshness: serveProof.verified },
        reasons: decision.policy.reasons,
      };
    } },
    policy: { maxAmount: 300, allowedKinds: ["purchase"] },
    execute: async () => { sideEffectCalls += 1; },
  });
  return {
    ...decision,
    receipt,
    execution: { ...decision.execution, status: receipt.execution.status, sideEffectCalls },
  };
}

async function verifyWallet(request: Request, body: { address: string; message: string; signature: string }) {
  const response = await fetch(new URL("/api/wallet/verify", request.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let receipt: any = null;
  try { receipt = await response.json(); } catch { receipt = null; }
  if (response.status !== 200 || receipt?.ok !== true || receipt?.checks?.signature !== true) {
    return { ok: false, status: response.status, receipt };
  }
  return { ok: true, status: response.status, receipt };
}

async function computeCall(input: {
  serviceUrl: string;
  apiSecret: string;
  model: string;
  system: string;
  user: unknown;
}) {
  const started = Date.now();
  const response = await fetch(chatCompletionsUrl(input.serviceUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiSecret}`,
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      max_tokens: 220,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: JSON.stringify(input.user) },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`0G Compute HTTP ${response.status}: ${(await response.text()).slice(0, 260)}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
  return { content: payload.choices?.[0]?.message?.content, latencyMs: Date.now() - started };
}

function proofField(value: unknown): string | null {
  if (value == null) return null;
  try { return String(value); } catch { return null; }
}

export function matchesServeProofTranscript(taskHash: unknown, transcript: ZeroGTranscript): boolean {
  return typeof taskHash === "string" && /^0x[0-9a-f]{64}$/i.test(taskHash)
    && computeZeroGTaskHash(transcript).toLowerCase() === taskHash.toLowerCase();
}

async function connectAttestor() {
  const { AgenticID } = await import("@0gfoundation/0g-agenticid-sdk");
  return AgenticID.fromAttestor(process.env.ZERO_G_ATTESTOR_URL?.trim() || "https://agenticid.0g.ai");
}

export function serveProofConfigurationFailure(): ServeProofGate | null {
  const agentUrl = process.env.RECEIPTGATE_AGENT_URL?.trim();
  const servicePath = process.env.RECEIPTGATE_AGENT_SERVICE_PATH?.trim();
  const expectedAgentId = process.env.RECEIPTGATE_AGENT_ID?.trim();
  if (!agentUrl || !servicePath || !expectedAgentId || !/^[1-9][0-9]*$/.test(expectedAgentId)) {
    return {
      configured: false,
      required: true,
      verified: false,
      reason: "candidate-bound Agentic ID URL, service path, and expected Agent ID are required",
    };
  }
  if (servicePath !== "/api/receiptgate") {
    return {
      configured: true,
      required: true,
      verified: false,
      servicePath,
      reason: "RECEIPTGATE_AGENT_SERVICE_PATH must be /api/receiptgate",
    };
  }
  return null;
}

export async function verifyCandidateServeProof(candidate: Candidate, candidateHashValue: string, connect = connectAttestor): Promise<ServeProofGate> {
  const configurationFailure = serveProofConfigurationFailure();
  if (configurationFailure) return configurationFailure;
  const agentUrl = process.env.RECEIPTGATE_AGENT_URL!.trim();
  const servicePath = process.env.RECEIPTGATE_AGENT_SERVICE_PATH!.trim();
  const expectedAgentId = process.env.RECEIPTGATE_AGENT_ID!.trim();

  try {
    const ag = await connect();
    const agent = await ag.agent.connect(agentUrl);
    const requestBody = JSON.stringify({ purpose: "receiptgate-candidate-binding", candidateHash: candidateHashValue, candidate });
    const { response, proof } = await agent.fetchWithProof(servicePath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: requestBody,
      signal: AbortSignal.timeout(15_000),
    });

    const text = await response.text();
    let payload: any = null;
    try { payload = JSON.parse(text); } catch { payload = null; }
    const echoedHash = typeof payload?.candidateHash === "string" ? payload.candidateHash.toLowerCase() : null;
    const responseBinding = echoedHash === candidateHashValue.toLowerCase()
      && payload?.accepted === true && payload?.service === "receiptgate-candidate-binding-v1";

    if (!proof) {
      return {
        configured: true,
        required: true,
        verified: false,
        servicePath,
        responseStatus: response.status,
        responseCandidateHash: echoedHash,
        responseBinding,
        proof: null,
        verification: null,
        reason: "Agentic ID service response carried no X-Agent-Proof",
      };
    }

    const verification = await ag.reputation.verifyProof(proof);
    const serviceUrl = new URL(servicePath, agent.base);
    const transcriptBinding = matchesServeProofTranscript(proof.taskHash, {
      method: "POST", requestUri: serviceUrl.pathname + serviceUrl.search, requestBody, responseBody: text, statusCode: response.status,
    });
    const identityBinding = String(proof.agentId) === expectedAgentId;
    const verified = response.ok && responseBinding && transcriptBinding && identityBinding && verification.ok === true;
    return {
      configured: true,
      required: true,
      verified,
      servicePath,
      responseStatus: response.status,
      responseCandidateHash: echoedHash,
      responseBinding,
      transcriptBinding,
      proof: {
        agentId: proofField((proof as any).agentId),
        submitter: proofField((proof as any).submitter),
        timestamp: proofField((proof as any).timestamp),
        deadline: proofField((proof as any).deadline),
        taskHash: proofField((proof as any).taskHash),
        dataHashes: Array.isArray((proof as any).dataHashes) ? (proof as any).dataHashes.map(String) : [],
        frameworkHash: proofField((proof as any).frameworkHash),
        signaturePresent: Boolean((proof as any).signature),
      },
      verification: {
        ok: verification.ok === true,
        signerMatches: verification.signerMatches,
        notExpired: verification.notExpired,
        dataOnChain: verification.dataOnChain,
        reasons: verification.reasons,
      },
      reason: verified
        ? undefined
        : !response.ok
          ? `Agentic ID service returned HTTP ${response.status}`
          : !identityBinding
            ? "ServeProof Agent ID does not match the expected service identity"
          : !transcriptBinding
            ? "ServeProof taskHash does not match the exact request/response transcript"
          : !responseBinding
            ? "signed service response is not bound to the execution candidateHash"
            : `ServeProof verification failed: ${verification.reasons?.join("; ") || "unknown reason"}`,
    };
  } catch (error) {
    return {
      configured: true,
      required: true,
      verified: false,
      servicePath,
      reason: safeError(error),
    };
  }
}

export default {
  async fetch(request: Request) {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        address?: string;
        message?: string;
        signature?: string;
        tamper?: boolean;
      };
      if (!body.address || !body.message || !body.signature) {
        return json({ live: false, authorized: false, error: "wallet authorization required" }, 401);
      }

      const verified = await verifyWallet(request, {
        address: body.address,
        message: body.message,
        signature: body.signature,
      });
      if (!verified.ok) {
        return json({ live: false, authorized: false, error: "wallet authorization failed", wallet: verified.receipt }, 401);
      }
      const wallet = verified.receipt;
      if (!walletAllowed(wallet.address)) {
        return json({ live: false, authorized: false, error: "wallet is not admitted to sponsored Compute" }, 403);
      }

      const unavailableProof = serveProofConfigurationFailure();
      if (unavailableProof) {
        return json({
          configured: false,
          live: false,
          authorized: true,
          error: unavailableProof.reason,
          blockedAt: "serveproof-configuration",
          serveProof: unavailableProof,
          execution: { status: "blocked", attempted: false },
          sideEffectCalls: 0,
          computeCalls: 0,
          proofBoundary: "runtime unavailable; no candidate or tamper verification was performed",
        }, 503);
      }

      const serviceUrl = process.env.ZG_SERVICE_URL?.trim();
      const apiSecret = process.env.ZG_API_SECRET?.trim();
      const model = process.env.ZG_MODEL?.trim();
      if (!serviceUrl || !apiSecret || !model) {
        return json({
          configured: false,
          live: false,
          authorized: true,
          error: "ZG_SERVICE_URL / ZG_MODEL / ZG_API_SECRET not configured",
          proofBoundary: "no-live-compute-without-runtime-config",
        }, 503);
      }
      const transport = classifyComputeTransport(serviceUrl);

      const procurementRaw = await computeCall({
        serviceUrl,
        apiSecret,
        model,
        system: "You are ProcurementAgent. Return ONLY one JSON object with exactly these keys: target, totalPriceUsd, currency, risk, reason. totalPriceUsd is the TOTAL price in USD for the whole order, never the credit quantity or a unit price. The quote.totalPriceUsd is 247 USD for the whole order; quantity is 10000 credits. The hard budget is 300 USD. If the quote is within budget, propose that exact total price. currency must be USD. risk must be low|medium|high. Do not claim execution. No markdown.",
        user: { task: "propose purchase candidate", product: "GPU inference credits", quantity: { value: 10_000, unit: "credits" }, quote: { totalPriceUsd: 247, currency: "USD" }, budgetUsd: 300 },
      });
      const procurement = parseProcurement(procurementRaw.content);
      const originalCandidate: Candidate = {
        id: "hackathon-gpu-credits-live-multi-agent",
        kind: "purchase",
        target: procurement.target,
        amount: procurement.amount,
        currency: procurement.currency,
        payload: {
          product: "GPU inference credits",
          units: 10_000,
          quotedPrice: 247,
          sourceRisk: procurement.risk,
          sourceReason: procurement.reason,
          computeModel: model,
        },
      };
      const originalHash = await candidateHash(originalCandidate);

      const transmittedCandidate: Candidate = body.tamper === true
        ? { ...originalCandidate, amount: originalCandidate.amount * 10, payload: { ...originalCandidate.payload } }
        : { ...originalCandidate, payload: { ...originalCandidate.payload } };
      const transmittedHash = await candidateHash(transmittedCandidate);

      const riskRaw = await computeCall({
        serviceUrl,
        apiSecret,
        model,
        system: "You are RiskAgent reviewing a candidate produced by another agent. Return ONLY one JSON object with exactly these keys: candidateHash, verdict, risk, reason. Echo the provided candidateHash EXACTLY. candidate.amount is the total price in USD; candidate.payload.units is a quantity, not money. verdict must be ALLOW only when amount <= 300, currency is USD, target is GPU/inference credits, and risk is not high; otherwise DENY. risk must be low|medium|high. Do not execute anything. No markdown.",
        user: { candidate: transmittedCandidate, candidateHash: transmittedHash, policy: { maxAmountUsd: 300, currency: "USD" } },
      });
      const review = parseRiskReview(riskRaw.content);
      const baseDecision = evaluateHandoff({
        originalHash,
        transmittedHash,
        review,
        candidate: transmittedCandidate,
      });

      const serveProof = await verifyCandidateServeProof(transmittedCandidate, transmittedHash);
      const decision = await executeVerifiedHandoff(transmittedCandidate, baseDecision, serveProof);

      return json({
        schema: "receiptgate-live-multi-agent-v3",
        configured: true,
        live: serveProof.verified,
        inferenceLive: true,
        fullPathLive: false,
        authorized: true,
        tampered: body.tamper === true,
        provider: transport,
        transport,
        model,
        walletAuthorization: {
          address: wallet.address,
          chainId: wallet.chainId,
          checks: wallet.checks,
          verificationTransport: wallet.verificationTransport,
        },
        agentA: {
          role: "ProcurementAgent",
          live: true,
          provider: transport,
          model,
          latencyMs: procurementRaw.latencyMs,
          candidate: originalCandidate,
          candidateHash: originalHash,
        },
        handoffInput: {
          candidate: transmittedCandidate,
          candidateHash: transmittedHash,
        },
        agentB: {
          role: "RiskAgent",
          live: true,
          provider: transport,
          model,
          latencyMs: riskRaw.latencyMs,
          review,
        },
        serveProof,
        ...decision,
        sideEffectCalls: decision.execution.sideEffectCalls,
        proofBoundary: "ServeProof required; full NORMAL/ATTACK runtime pair not yet validated; demo callback only, no financial settlement",
      });
    } catch (error) {
      return json({ configured: true, live: false, authorized: false, error: safeError(error) }, 503);
    }
  },
};
