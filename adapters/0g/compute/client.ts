import type { CandidateAction } from "../../../core/receipt";

export interface ProcurementRequest {
  id: string;
  units: number;
  maxBudget: number;
  currency: string;
  product: string;
}

interface ModelDecision {
  target: string;
  amount: number;
  currency: string;
  risk: "low" | "medium" | "high";
  reason: string;
}

export interface ZeroGComputeClientOptions {
  serviceUrl: string;
  apiSecret: string;
  model: string;
  fetchImpl?: typeof fetch;
}

function chatCompletionsUrl(serviceUrl: string): string {
  const base = serviceUrl.replace(/\/+$/, "");
  return base.endsWith("/v1/proxy")
    ? `${base}/chat/completions`
    : `${base}/v1/proxy/chat/completions`;
}

function parseStrictDecision(content: unknown): ModelDecision {
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("0G Compute returned empty/non-string message content");
  }

  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("0G Compute decision must be strict JSON with no prose or code fence");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("0G Compute decision must be a JSON object");
  }

  const row = value as Record<string, unknown>;
  const allowedKeys = new Set(["target", "amount", "currency", "risk", "reason"]);
  const unexpected = Object.keys(row).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) {
    throw new Error(`0G Compute decision has unexpected fields: ${unexpected.join(",")}`);
  }

  if (typeof row.target !== "string" || row.target.trim().length === 0) {
    throw new Error("0G Compute decision target is missing");
  }
  if (typeof row.amount !== "number" || !Number.isFinite(row.amount) || row.amount <= 0) {
    throw new Error("0G Compute decision amount must be a finite positive number");
  }
  if (typeof row.currency !== "string" || row.currency.trim().length === 0) {
    throw new Error("0G Compute decision currency is missing");
  }
  if (row.risk !== "low" && row.risk !== "medium" && row.risk !== "high") {
    throw new Error("0G Compute decision risk must be low, medium, or high");
  }
  if (typeof row.reason !== "string" || row.reason.trim().length === 0) {
    throw new Error("0G Compute decision reason is missing");
  }

  return {
    target: row.target.trim(),
    amount: row.amount,
    currency: row.currency.trim(),
    risk: row.risk,
    reason: row.reason.trim(),
  };
}

export class ZeroGComputeClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ZeroGComputeClientOptions) {
    if (!options.serviceUrl) throw new Error("0G Compute serviceUrl is required");
    if (!options.apiSecret) throw new Error("0G Compute apiSecret is required");
    if (!options.model) throw new Error("0G Compute model is required");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async proposePurchase(request: ProcurementRequest): Promise<CandidateAction> {
    const response = await this.fetchImpl(chatCompletionsUrl(this.options.serviceUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiSecret}`,
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: 0,
        max_tokens: 180,
        messages: [
          {
            role: "system",
            content:
              "Return ONLY one JSON object with exactly these keys: target, amount, currency, risk, reason. risk must be low|medium|high. No markdown. Do not claim an action was executed.",
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "propose a provider purchase candidate",
              product: request.product,
              units: request.units,
              budget: request.maxBudget,
              currency: request.currency,
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 240);
      throw new Error(`0G Compute HTTP ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const decision = parseStrictDecision(payload.choices?.[0]?.message?.content);

    if (decision.currency !== request.currency) {
      throw new Error(`0G Compute currency ${decision.currency} does not match request ${request.currency}`);
    }

    return {
      id: request.id,
      kind: "purchase",
      target: decision.target,
      amount: decision.amount,
      currency: decision.currency,
      payload: {
        product: request.product,
        units: request.units,
        risk: decision.risk,
        reason: decision.reason,
        computeModel: this.options.model,
      },
    };
  }
}
