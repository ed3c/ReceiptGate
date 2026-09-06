import { mkdir } from "node:fs/promises";
import { evaluatePolicy } from "../../../core/policy";
import { ZeroGComputeClient } from "./client";

const serviceUrl = process.env.ZG_SERVICE_URL?.trim();
const apiSecret = process.env.ZG_API_SECRET?.trim();
const model = process.env.ZG_MODEL?.trim();
const targetSha = process.env.TARGET_SHA ?? process.env.GITHUB_SHA ?? "local";

if (!serviceUrl) throw new Error("ZG_SERVICE_URL is required");
if (!apiSecret) throw new Error("ZG_API_SECRET GitHub secret is required");
if (!model) throw new Error("ZG_MODEL is required");

const request = {
  id: "hackathon-gpu-credits-001",
  units: 10_000,
  maxBudget: 300,
  currency: "USD",
  product: "GPU inference credits",
};

const client = new ZeroGComputeClient({ serviceUrl, apiSecret, model });
const candidate = await client.proposePurchase(request);
const policy = evaluatePolicy(candidate, {
  maxAmount: request.maxBudget,
  allowedKinds: ["purchase"],
});

const receipt = {
  schema: "receiptgate-0g-compute-live-v1",
  accepted: policy.allowed,
  commit: targetSha,
  runner: process.env.GITHUB_ACTIONS === "true" ? "github-actions" : "local",
  compute: {
    provider: "0g-compute",
    model,
    liveInference: true,
  },
  candidate,
  policy,
  proofBoundary: "none-live-compute-only",
  generatedAt: new Date().toISOString(),
};

await mkdir("artifacts", { recursive: true });
await Bun.write("artifacts/0g-compute-live.json", JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({
  schema: receipt.schema,
  commit: receipt.commit,
  model,
  amount: candidate.amount,
  policyAllowed: policy.allowed,
  proofBoundary: receipt.proofBoundary,
}));

if (!policy.allowed) {
  throw new Error(`live 0G Compute candidate was deterministically denied: ${policy.reasons.join("; ")}`);
}
