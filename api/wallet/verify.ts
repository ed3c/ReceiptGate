const GALILEO_CHAIN_ID = 16602;
const GALILEO_CHAIN_HEX = "0x40da";
const GALILEO_RPC_URL = "https://evmrpc-testnet.0g.ai";
const ECRECOVER_PRECOMPILE = "0x0000000000000000000000000000000000000001";
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

function bytesToHex(bytes: Uint8Array): string {
  let hex = "0x";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

async function rpc(method: string, params: unknown[]): Promise<string> {
  const response = await fetch(GALILEO_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Galileo RPC HTTP ${response.status}`);
  const payload = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (payload.error) throw new Error(`Galileo RPC ${method}: ${payload.error.message ?? "unknown error"}`);
  if (typeof payload.result !== "string") throw new Error(`Galileo RPC ${method}: missing result`);
  return payload.result;
}

async function personalMessageHash(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(message);
  const prefixBytes = encoder.encode(`\u0019Ethereum Signed Message:\n${messageBytes.length}`);
  const payload = new Uint8Array(prefixBytes.length + messageBytes.length);
  payload.set(prefixBytes, 0);
  payload.set(messageBytes, prefixBytes.length);
  const hash = await rpc("web3_sha3", [bytesToHex(payload)]);
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Galileo RPC returned invalid personal-message hash");
  return hash;
}

async function recoverSigner(message: string, signature: string): Promise<{ address: string | null; chainOk: boolean }> {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return { address: null, chainOk: false };

  const chainId = await rpc("eth_chainId", []);
  const chainOk = chainId.toLowerCase() === GALILEO_CHAIN_HEX;
  if (!chainOk) return { address: null, chainOk: false };

  const hash = await personalMessageHash(message);
  const r = signature.slice(2, 66);
  const s = signature.slice(66, 130);
  let v = Number.parseInt(signature.slice(130, 132), 16);
  if (v === 0 || v === 1) v += 27;
  if (v !== 27 && v !== 28) return { address: null, chainOk: true };

  const input = `0x${hash.slice(2)}${v.toString(16).padStart(64, "0")}${r}${s}`;
  const recovered = await rpc("eth_call", [
    { to: ECRECOVER_PRECOMPILE, data: input },
    "latest",
  ]);
  if (!/^0x[0-9a-fA-F]{64}$/.test(recovered)) return { address: null, chainOk: true };
  const address = `0x${recovered.slice(-40)}`;
  if (/^0x0{40}$/i.test(address)) return { address: null, chainOk: true };
  return { address: address.toLowerCase(), chainOk: true };
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
    rpcChain: false,
    signature: false,
  };

  if (Object.values(checks).slice(0, -2).every(Boolean) && /^0x[0-9a-fA-F]{130}$/.test(input.signature)) {
    try {
      const recovered = await recoverSigner(input.message, input.signature);
      checks.rpcChain = recovered.chainOk;
      checks.signature = recovered.address === input.address.toLowerCase();
    } catch {
      checks.rpcChain = false;
      checks.signature = false;
    }
  }

  return {
    schema: "receiptgate-wallet-authorization-v3",
    ok: Object.values(checks).every(Boolean),
    address: input.address,
    chainId: GALILEO_CHAIN_ID,
    candidate: CANDIDATE,
    candidateHash: CANDIDATE_HASH,
    origin: fields.origin,
    issuedAtMs,
    expiresAtMs,
    checks,
    verificationTransport: "0g-galileo-rpc-ecrecover",
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
