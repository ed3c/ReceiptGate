import { verifyMessage } from "viem";

const GALILEO_CHAIN_ID = 16602;
const WALLET_AUTH_TTL_MS = 2 * 60_000;
const CANDIDATE_HASH = "f27d90312829eea02c99774da14dbc7e7cce47907f708b5bb099987d4e1aa110";
const CANDIDATE = {
  id: "hackathon-gpu-credits-wallet-001",
  kind: "purchase",
  target: "0G GPU inference credits",
  amount: 247,
  currency: "USD",
  payload: { units: 10_000, product: "GPU inference credits" },
};
const EXPECTED_FIELDS = ["wallet","chainId","candidateId","candidateHash","amount","currency","origin","issuedAtMs","expiresAtMs","nonce"];

function validAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function parseMessage(message: string): Record<string, string> {
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

export async function verifyPublicWalletAuthorization(input: {
  address: string;
  message: string;
  signature: string;
  expectedOrigin: string;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  if (!validAddress(input.address)) throw new Error("invalid wallet address");
  const fields = parseMessage(input.message);
  const issuedAtMs = Number(fields.issuedAtMs);
  const expiresAtMs = Number(fields.expiresAtMs);
  const checks = {
    wallet: validAddress(fields.wallet) && fields.wallet.toLowerCase() === input.address.toLowerCase(),
    chain: fields.chainId === String(GALILEO_CHAIN_ID),
    candidateId: fields.candidateId === CANDIDATE.id,
    candidateHash: fields.candidateHash === CANDIDATE_HASH,
    amount: fields.amount === String(CANDIDATE.amount),
    currency: fields.currency === CANDIDATE.currency,
    origin: (() => {
      try { return new URL(fields.origin).origin === new URL(input.expectedOrigin).origin; } catch { return false; }
    })(),
    issuedAt: Number.isSafeInteger(issuedAtMs) && issuedAtMs <= nowMs + 30_000 && issuedAtMs >= nowMs - WALLET_AUTH_TTL_MS,
    freshness: Number.isSafeInteger(expiresAtMs) && expiresAtMs > nowMs && expiresAtMs - issuedAtMs === WALLET_AUTH_TTL_MS,
    signature: false,
  };

  if (Object.values(checks).slice(0, -1).every(Boolean) && /^0x[0-9a-fA-F]{130}$/.test(input.signature)) {
    try {
      checks.signature = await verifyMessage({
        address: input.address as `0x${string}`,
        message: input.message,
        signature: input.signature as `0x${string}`,
      });
    } catch {
      checks.signature = false;
    }
  }

  return {
    schema: "receiptgate-wallet-authorization-v2",
    ok: Object.values(checks).every(Boolean),
    address: input.address,
    chainId: GALILEO_CHAIN_ID,
    candidate: CANDIDATE,
    candidateHash: CANDIDATE_HASH,
    origin: fields.origin,
    issuedAtMs,
    expiresAtMs,
    checks,
    proofBoundary: "user-wallet-authorization-not-agentic-id-proof",
  };
}

export default {
  async fetch(request: Request) {
    try {
      const body = (await request.json()) as { address?: string; message?: string; signature?: string };
      if (!body.address || !body.message || !body.signature) {
        return Response.json({ error: "address, message and signature are required" }, { status: 400 });
      }
      const receipt = await verifyPublicWalletAuthorization({
        address: body.address,
        message: body.message,
        signature: body.signature,
        expectedOrigin: new URL(request.url).origin,
      });
      return Response.json(receipt, {
        status: receipt.ok ? 200 : 401,
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ error: message.slice(0, 400) }, { status: 400 });
    }
  },
};
