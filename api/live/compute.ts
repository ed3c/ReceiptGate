const GALILEO_CHAIN_ID = 16602;
const WALLET_AUTH_TTL_MS = 2 * 60_000;
const CANDIDATE_HASH = "f27d90312829eea02c99774da14dbc7e7cce47907f708b5bb099987d4e1aa110";
const WALLET_CANDIDATE = {
  id: "hackathon-gpu-credits-wallet-001",
  kind: "purchase",
  target: "0G GPU inference credits",
  amount: 247,
  currency: "USD",
  payload: { units: 10_000, product: "GPU inference credits" },
};
const EXPECTED_FIELDS = ["wallet","chainId","candidateId","candidateHash","amount","currency","origin","issuedAtMs","expiresAtMs","nonce"];

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/app-sk-[A-Za-z0-9._-]+/g, "[redacted-api-secret]")
    .replace(/0x[a-fA-F0-9]{64}/g, "[redacted-private-material]")
    .slice(0, 400);
}

function validAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function parseAuthorization(message: string): Record<string, string> {
  const lines = message.split("\n");
  if (lines.shift() !== "ReceiptGate Wallet Authorization v1") throw new Error("wallet authorization header mismatch");
  const values: Record<string, string> = {};
  for (const line of lines) {
    const index = line.indexOf("=");
    if (index <= 0) throw new Error("malformed wallet authorization line");
    const key = line.slice(0, index);
    if (key in values) throw new Error(`duplicate wallet authorization field: ${key}`);
    values[key] = line.slice(index + 1);
  }
  const keys = Object.keys(values).sort();
  const expected = [...EXPECTED_FIELDS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error("wallet authorization fields mismatch");
  }
  return values;
}

async function verifyAuthorization(address: string, message: string, signature: string, expectedOrigin: string) {
  if (!validAddress(address)) throw new Error("invalid wallet address");
  const fields = parseAuthorization(message);
  const nowMs = Date.now();
  const issuedAtMs = Number(fields.issuedAtMs);
  const expiresAtMs = Number(fields.expiresAtMs);
  const checks = {
    wallet: validAddress(fields.wallet) && fields.wallet.toLowerCase() === address.toLowerCase(),
    chain: fields.chainId === String(GALILEO_CHAIN_ID),
    candidateId: fields.candidateId === WALLET_CANDIDATE.id,
    candidateHash: fields.candidateHash === CANDIDATE_HASH,
    amount: fields.amount === String(WALLET_CANDIDATE.amount),
    currency: fields.currency === WALLET_CANDIDATE.currency,
    origin: (() => {
      try { return new URL(fields.origin).origin === new URL(expectedOrigin).origin; } catch { return false; }
    })(),
    issuedAt: Number.isSafeInteger(issuedAtMs) && issuedAtMs <= nowMs + 30_000 && issuedAtMs >= nowMs - WALLET_AUTH_TTL_MS,
    freshness: Number.isSafeInteger(expiresAtMs) && expiresAtMs > nowMs && expiresAtMs - issuedAtMs === WALLET_AUTH_TTL_MS,
    signature: false,
  };
  if (Object.values(checks).slice(0, -1).every(Boolean) && /^0x[0-9a-fA-F]{130}$/.test(signature)) {
    try {
      const { verifyMessage } = await import("viem");
      checks.signature = await verifyMessage({
        address: address as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });
    } catch {
      checks.signature = false;
    }
  }
  return { ok: Object.values(checks).every(Boolean), address, chainId: GALILEO_CHAIN_ID, checks };
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

function parseDecision(content: unknown) {
  if (typeof content !== "string" || content.length === 0) throw new Error("0G Compute returned empty/non-string message content");
  let value: unknown;
  try { value = JSON.parse(content); } catch { throw new Error("0G Compute decision must be strict JSON with no prose or code fence"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("0G Compute decision must be a JSON object");
  const row = value as Record<string, unknown>;
  const allowed = new Set(["target","amount","currency","risk","reason"]);
  if (Object.keys(row).some((key) => !allowed.has(key))) throw new Error("0G Compute decision has unexpected fields");
  if (typeof row.target !== "string" || !row.target.trim()) throw new Error("0G Compute decision target is missing");
  if (typeof row.amount !== "number" || !Number.isFinite(row.amount) || row.amount <= 0) throw new Error("0G Compute decision amount must be a finite positive number");
  if (row.currency !== "USD") throw new Error("0G Compute currency must be USD");
  if (row.risk !== "low" && row.risk !== "medium" && row.risk !== "high") throw new Error("0G Compute decision risk must be low, medium, or high");
  if (typeof row.reason !== "string" || !row.reason.trim()) throw new Error("0G Compute decision reason is missing");
  return { target: row.target.trim(), amount: row.amount, currency: row.currency, risk: row.risk, reason: row.reason.trim() };
}

async function runCompute() {
  const serviceUrl = process.env.ZG_SERVICE_URL?.trim();
  const apiSecret = process.env.ZG_API_SECRET?.trim();
  const model = process.env.ZG_MODEL?.trim();
  if (!serviceUrl || !apiSecret || !model) {
    return { configured: false, live: false, reason: "ZG_SERVICE_URL / ZG_MODEL / ZG_API_SECRET not configured" };
  }
  const response = await fetch(chatCompletionsUrl(serviceUrl), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiSecret}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 180,
      messages: [
        { role: "system", content: "Return ONLY one JSON object with exactly these keys: target, amount, currency, risk, reason. risk must be low|medium|high. No markdown. Do not claim an action was executed." },
        { role: "user", content: JSON.stringify({ task: "propose a provider purchase candidate", product: "GPU inference credits", units: 10_000, budget: 300, currency: "USD" }) },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`0G Compute HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
  const decision = parseDecision(payload.choices?.[0]?.message?.content);
  const candidate = {
    id: "hackathon-gpu-credits-live",
    kind: "purchase",
    target: decision.target,
    amount: decision.amount,
    currency: decision.currency,
    payload: { product: "GPU inference credits", units: 10_000, risk: decision.risk, reason: decision.reason, computeModel: model },
  };
  const reasons: string[] = [];
  if (candidate.kind !== "purchase") reasons.push(`action kind ${candidate.kind} is not allowed`);
  if (!Number.isFinite(candidate.amount)) reasons.push("candidate amount is missing or invalid");
  else if (candidate.amount > 300) reasons.push(`candidate amount ${candidate.amount} exceeds max 300`);
  return { configured: true, live: true, provider: "0g-compute", model, candidate, policy: { allowed: reasons.length === 0, reasons }, proofBoundary: "none-live-compute-only" };
}

export default {
  async fetch(request: Request) {
    try {
      const body = (await request.json().catch(() => ({}))) as { address?: string; message?: string; signature?: string };
      if (!body.address || !body.message || !body.signature) {
        return json({ live: false, authorized: false, error: "wallet authorization required" }, 401);
      }
      const wallet = await verifyAuthorization(body.address, body.message, body.signature, new URL(request.url).origin);
      if (!wallet.ok) return json({ live: false, authorized: false, error: "wallet authorization failed", wallet }, 401);
      if (!walletAllowed(wallet.address)) return json({ live: false, authorized: false, error: "wallet is not admitted to sponsored Compute", wallet: { address: wallet.address, chainId: wallet.chainId } }, 403);
      const result = await runCompute();
      return json({ ...result, authorized: true, walletAuthorization: wallet });
    } catch (error) {
      return json({ configured: true, live: false, authorized: false, error: safeError(error) }, 503);
    }
  },
};
