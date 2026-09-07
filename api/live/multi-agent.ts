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

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/app-sk-[A-Za-z0-9._-]+/g, "[redacted-api-secret]")
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

function chatCompletionsUrl(serviceUrl: string): string {
  const base = serviceUrl.replace(/\/+$/, "");
  return base.endsWith("/v1/proxy") ? `${base}/chat/completions` : `${base}/v1/proxy/chat/completions`;
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

function parseProcurement(content: unknown) {
  const row = exactObject(parseStrictJson(content, "ProcurementAgent"), ["target", "amount", "currency", "risk", "reason"], "ProcurementAgent decision");
  if (typeof row.target !== "string" || !row.target.trim()) throw new Error("ProcurementAgent target is missing");
  if (typeof row.amount !== "number" || !Number.isFinite(row.amount) || row.amount <= 0) throw new Error("ProcurementAgent amount must be a finite positive number");
  if (row.currency !== "USD") throw new Error("ProcurementAgent currency must be USD");
  if (row.risk !== "low" && row.risk !== "medium" && row.risk !== "high") throw new Error("ProcurementAgent risk must be low, medium, or high");
  if (typeof row.reason !== "string" || !row.reason.trim()) throw new Error("ProcurementAgent reason is missing");
  return {
    target: row.target.trim(),
    amount: row.amount,
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

      const serviceUrl = process.env.ZG_SERVICE_URL?.trim();
      const apiSecret = process.env.ZG_API_SECRET?.trim();
      const model = process.env.ZG_MODEL?.trim();
      if (!serviceUrl || !apiSecret || !model) {
        return json({
          configured: false,
          live: false,
          authorized: true,
          error: "ZG_SERVICE_URL / ZG_MODEL / ZG_API_SECRET not configured",
          proofBoundary: "no-live-compute-without-provider-runtime-config",
        }, 503);
      }

      const procurementRaw = await computeCall({
        serviceUrl,
        apiSecret,
        model,
        system: "You are ProcurementAgent. Return ONLY one JSON object with exactly these keys: target, amount, currency, risk, reason. The quoted price is 247 USD for 10,000 GPU inference credits and the hard budget is 300 USD. If the quote is within budget, propose that exact quoted price. currency must be USD. risk must be low|medium|high. Do not claim execution. No markdown.",
        user: { task: "propose purchase candidate", product: "GPU inference credits", units: 10_000, quote: 247, budget: 300, currency: "USD" },
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
        system: "You are RiskAgent reviewing a candidate produced by another agent. Return ONLY one JSON object with exactly these keys: candidateHash, verdict, risk, reason. Echo the provided candidateHash EXACTLY. verdict must be ALLOW only when amount <= 300, currency is USD, target is GPU/inference credits, and risk is not high; otherwise DENY. risk must be low|medium|high. Do not execute anything. No markdown.",
        user: { candidate: transmittedCandidate, candidateHash: transmittedHash, policy: { maxAmountUsd: 300, currency: "USD" } },
      });
      const review = parseRiskReview(riskRaw.content);
      const decision = evaluateHandoff({
        originalHash,
        transmittedHash,
        review,
        candidate: transmittedCandidate,
      });

      return json({
        schema: "receiptgate-live-multi-agent-v1",
        configured: true,
        live: true,
        authorized: true,
        tampered: body.tamper === true,
        provider: "0g-compute",
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
          provider: "0g-compute",
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
          provider: "0g-compute",
          model,
          latencyMs: riskRaw.latencyMs,
          review,
        },
        ...decision,
        sideEffectCalls: decision.execution.sideEffectCalls,
        proofBoundary: "two-live-0g-compute-role-calls-with-handoff-binding; Agentic-ID candidate proof remains a separate upgrade",
      });
    } catch (error) {
      return json({ configured: true, live: false, authorized: false, error: safeError(error) }, 503);
    }
  },
};
