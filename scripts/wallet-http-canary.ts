import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const baseUrl = (process.env.RECEIPTGATE_BASE_URL ?? `http://127.0.0.1:${process.env.DEMO_PORT ?? 3000}`).replace(/\/+$/, "");
const account = privateKeyToAccount(generatePrivateKey());

const challengeResponse = await fetch(`${baseUrl}/api/wallet/challenge?address=${account.address}`);
const challenge = await challengeResponse.json() as { message?: string; chainId?: number; origin?: string; error?: string };
if (!challengeResponse.ok || typeof challenge.message !== "string") {
  throw new Error(`wallet challenge failed (${challengeResponse.status}): ${challenge.error ?? "missing message"}`);
}

const signature = await account.signMessage({ message: challenge.message });
const authorization = { address: account.address, message: challenge.message, signature };

const verifyResponse = await fetch(`${baseUrl}/api/wallet/verify`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(authorization),
});
const verification = await verifyResponse.json() as { ok?: boolean; checks?: { signature?: boolean; origin?: boolean; chain?: boolean; candidateHash?: boolean }; error?: string };
if (verifyResponse.status !== 200 || verification.ok !== true || verification.checks?.signature !== true || verification.checks?.origin !== true || verification.checks?.chain !== true || verification.checks?.candidateHash !== true) {
  throw new Error(`wallet verification failed (${verifyResponse.status}): ${verification.error ?? JSON.stringify(verification.checks)}`);
}

const computeResponse = await fetch(`${baseUrl}/api/live/compute`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(authorization),
});
const compute = await computeResponse.json() as Record<string, unknown>;

// The ephemeral key is intentionally never printed, written, or exported.
console.log(JSON.stringify(compute));

if (computeResponse.status >= 400 || compute.authorized !== true) {
  throw new Error(`wallet-authorized Compute failed (${computeResponse.status})`);
}
