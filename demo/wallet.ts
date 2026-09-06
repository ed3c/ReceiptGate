import { getAddress, isAddress, verifyMessage } from "viem";
import { sha256Hex } from "../core/hash";
import type { CandidateAction } from "../core/receipt";

export const GALILEO_CHAIN_ID = 16602;
export const GALILEO_CHAIN_HEX = "0x40da";
export const GALILEO_RPC_URL = "https://evmrpc-testnet.0g.ai";
export const WALLET_AUTH_TTL_MS = 5 * 60_000;

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

export interface WalletChallenge {
  schema: "receiptgate-wallet-challenge-v1";
  wallet: `0x${string}`;
  chainId: number;
  candidate: CandidateAction;
  candidateHash: string;
  issuedAtMs: number;
  expiresAtMs: number;
  message: string;
}

export function createWalletChallenge(address: string, nowMs = Date.now()): WalletChallenge {
  if (!isAddress(address)) throw new Error("valid wallet address is required");
  const wallet = getAddress(address);
  const issuedAtMs = nowMs;
  const expiresAtMs = issuedAtMs + WALLET_AUTH_TTL_MS;
  const message = [
    HEADER,
    `wallet=${wallet}`,
    `chainId=${GALILEO_CHAIN_ID}`,
    `candidateId=${WALLET_CANDIDATE.id}`,
    `candidateHash=${EXPECTED_HASH}`,
    `amount=${WALLET_CANDIDATE.amount}`,
    `currency=${WALLET_CANDIDATE.currency}`,
    `issuedAtMs=${issuedAtMs}`,
    `expiresAtMs=${expiresAtMs}`,
  ].join("\n");
  return {
    schema: "receiptgate-wallet-challenge-v1",
    wallet,
    chainId: GALILEO_CHAIN_ID,
    candidate: WALLET_CANDIDATE,
    candidateHash: EXPECTED_HASH,
    issuedAtMs,
    expiresAtMs,
    message,
  };
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
  return values;
}

export async function verifyWalletAuthorization(input: {
  address: string;
  message: string;
  signature: `0x${string}`;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  if (!isAddress(input.address)) throw new Error("invalid wallet address");
  const address = getAddress(input.address);
  const fields = parseMessage(input.message);
  const issuedAtMs = Number(fields.issuedAtMs);
  const expiresAtMs = Number(fields.expiresAtMs);

  const checks = {
    wallet: fields.wallet === address,
    chain: fields.chainId === String(GALILEO_CHAIN_ID),
    candidateId: fields.candidateId === WALLET_CANDIDATE.id,
    candidateHash: fields.candidateHash === EXPECTED_HASH,
    amount: fields.amount === String(WALLET_CANDIDATE.amount),
    currency: fields.currency === WALLET_CANDIDATE.currency,
    issuedAt: Number.isSafeInteger(issuedAtMs) && issuedAtMs <= nowMs + 30_000,
    freshness:
      Number.isSafeInteger(expiresAtMs) &&
      expiresAtMs > nowMs &&
      expiresAtMs - issuedAtMs === WALLET_AUTH_TTL_MS,
    signature: false,
  };

  if (Object.values(checks).slice(0, -1).every(Boolean)) {
    checks.signature = await verifyMessage({
      address,
      message: input.message,
      signature: input.signature,
    });
  }

  const ok = Object.values(checks).every(Boolean);
  return {
    schema: "receiptgate-wallet-authorization-v1",
    ok,
    address,
    chainId: GALILEO_CHAIN_ID,
    candidate: WALLET_CANDIDATE,
    candidateHash: EXPECTED_HASH,
    issuedAtMs,
    expiresAtMs,
    checks,
    proofBoundary: "user-wallet-authorization-not-agentic-id-proof",
  };
}
