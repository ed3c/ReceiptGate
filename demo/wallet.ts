import { getAddress, isAddress, verifyMessage } from "viem";
import { sha256Hex } from "../core/hash";
import type { CandidateAction } from "../core/receipt";

export const GALILEO_CHAIN_ID = 16602;
export const GALILEO_CHAIN_HEX = "0x40da";
export const GALILEO_RPC_URL = "https://evmrpc-testnet.0g.ai";
export const GALILEO_EXPLORER = "https://chainscan-galileo.0g.ai";
export const WALLET_AUTH_TTL_MS = 2 * 60_000;

export const WALLET_CANDIDATE: CandidateAction = {
  id: "hackathon-gpu-credits-wallet-001",
  kind: "purchase",
  target: "0G GPU inference credits",
  amount: 247,
  currency: "USD",
  payload: { units: 10_000, product: "GPU inference credits" },
};

const EXPECTED_HASH = sha256Hex(WALLET_CANDIDATE);
const HEADER = "ReceiptGate Wallet Authorization v1";
const EXPECTED_FIELDS = ["wallet","chainId","candidateId","candidateHash","amount","currency","origin","issuedAtMs","expiresAtMs","nonce"] as const;

export interface WalletChallenge {
  schema: "receiptgate-wallet-challenge-v2";
  wallet: `0x${string}`;
  chainId: number;
  candidate: CandidateAction;
  candidateHash: string;
  origin: string;
  issuedAtMs: number;
  expiresAtMs: number;
  nonce: string;
  message: string;
}

function normalizeOrigin(origin: string): string {
  return new URL(origin).origin;
}

export function createWalletChallenge(address: string, origin: string, nowMs = Date.now(), nonce: string = crypto.randomUUID()): WalletChallenge {
  if (!isAddress(address)) throw new Error("valid wallet address is required");
  const wallet = getAddress(address);
  const issuedAtMs = nowMs;
  const expiresAtMs = issuedAtMs + WALLET_AUTH_TTL_MS;
  const normalizedOrigin = normalizeOrigin(origin);
  const message = [
    HEADER,
    `wallet=${wallet}`,
    `chainId=${GALILEO_CHAIN_ID}`,
    `candidateId=${WALLET_CANDIDATE.id}`,
    `candidateHash=${EXPECTED_HASH}`,
    `amount=${WALLET_CANDIDATE.amount}`,
    `currency=${WALLET_CANDIDATE.currency}`,
    `origin=${normalizedOrigin}`,
    `issuedAtMs=${issuedAtMs}`,
    `expiresAtMs=${expiresAtMs}`,
    `nonce=${nonce}`,
  ].join("\n");
  return { schema: "receiptgate-wallet-challenge-v2", wallet, chainId: GALILEO_CHAIN_ID, candidate: WALLET_CANDIDATE, candidateHash: EXPECTED_HASH, origin: normalizedOrigin, issuedAtMs, expiresAtMs, nonce, message };
}

function parseMessage(message: string): Record<string, string> {
  const lines = message.split("\n");
  if (lines.shift() !== HEADER) throw new Error("wallet authorization header mismatch");
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
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw new Error("wallet authorization fields mismatch");
  return values;
}

export async function verifyWalletAuthorization(input: { address: string; message: string; signature: `0x${string}` | string; expectedOrigin: string; nowMs?: number }) {
  const nowMs = input.nowMs ?? Date.now();
  if (!isAddress(input.address)) throw new Error("invalid wallet address");
  const address = getAddress(input.address);
  const fields = parseMessage(input.message);
  const issuedAtMs = Number(fields.issuedAtMs);
  const expiresAtMs = Number(fields.expiresAtMs);
  let originOk = false;
  try { originOk = normalizeOrigin(fields.origin) === normalizeOrigin(input.expectedOrigin); } catch { originOk = false; }
  const checks = {
    wallet: isAddress(fields.wallet) && getAddress(fields.wallet) === address,
    chain: fields.chainId === String(GALILEO_CHAIN_ID),
    candidateId: fields.candidateId === WALLET_CANDIDATE.id,
    candidateHash: fields.candidateHash === EXPECTED_HASH,
    amount: fields.amount === String(WALLET_CANDIDATE.amount),
    currency: fields.currency === WALLET_CANDIDATE.currency,
    origin: originOk,
    issuedAt: Number.isSafeInteger(issuedAtMs) && issuedAtMs <= nowMs + 30_000 && issuedAtMs >= nowMs - WALLET_AUTH_TTL_MS,
    freshness: Number.isSafeInteger(expiresAtMs) && expiresAtMs > nowMs && expiresAtMs - issuedAtMs === WALLET_AUTH_TTL_MS,
    signature: false,
  };
  if (Object.values(checks).slice(0, -1).every(Boolean) && /^0x[0-9a-fA-F]{130}$/.test(input.signature)) {
    try { checks.signature = await verifyMessage({ address, message: input.message, signature: input.signature as `0x${string}` }); } catch { checks.signature = false; }
  }
  const ok = Object.values(checks).every(Boolean);
  return { schema: "receiptgate-wallet-authorization-v2", ok, address, chainId: GALILEO_CHAIN_ID, candidate: WALLET_CANDIDATE, candidateHash: EXPECTED_HASH, origin: fields.origin, issuedAtMs, expiresAtMs, checks, proofBoundary: "user-wallet-authorization-not-agentic-id-proof" };
}

export function walletAllowed(address: `0x${string}`): boolean {
  const configured = process.env.DEMO_ALLOWED_WALLETS?.trim();
  if (!configured) return true;
  const allowed = configured.split(",").map((value) => value.trim()).filter((value): value is `0x${string}` => isAddress(value)).map((value) => getAddress(value).toLowerCase());
  return allowed.includes(address.toLowerCase());
}
