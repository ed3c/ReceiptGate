import { preflightDSH } from "./dsh-runtime";
import { mkdir } from "node:fs/promises";
import { AgenticID } from "@0gfoundation/0g-agenticid-sdk";

const privateKey = process.env.PRIVATE_KEY?.trim();
const attestorUrl = process.env.ZERO_G_ATTESTOR_URL?.trim() || "https://agenticid.0g.ai";
const agentApiKey = process.env.OPENROUTER_API_KEY?.trim();
const requestedModel = process.env.AGENT_MODEL?.trim();
const framework = "dsh";
const name = process.env.ZG_AGENT_NAME?.trim() || "ReceiptGate Demo Agent";
const idempotencyKey = process.env.AGENT_IDEMPOTENCY_KEY?.trim() || "receiptgate-dsh-openrouter-v1";

const MIN_SANDBOX_BALANCE_WEI = 100_000_000_000_000_000n; // 0.1 OG
const TARGET_SANDBOX_BALANCE_WEI = 200_000_000_000_000_000n; // 0.2 OG

if (process.env.GITHUB_ACTIONS === "true") {
  throw new Error("Agentic ID provisioning is local-only by default; PRIVATE_KEY must not enter normal GitHub Actions runtime");
}
if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("PRIVATE_KEY must be a 0x-prefixed 32-byte demo-wallet key");
if (!agentApiKey) throw new Error("OPENROUTER_API_KEY is required for the sealed runtime");

const model = requestedModel || "";
const iData = await preflightDSH(model, agentApiKey);
console.log(JSON.stringify({ phase: "dsh-preflight", framework, provider: "openrouter", model, toolCalling: true, inferenceProofVerified: false }));

const ag = await AgenticID.fromAttestor(attestorUrl, { account: privateKey as `0x${string}` });

const ackBefore = await ag.ackStatus();
console.log(JSON.stringify({
  phase: "preflight-trust-roots",
  allAcked: ackBefore.allAcked,
  missing: ackBefore.missing,
}));
if (!ackBefore.allAcked) {
  const ackTx = await ag.ack();
  if (ackTx) {
    console.log(JSON.stringify({ phase: "preflight-trust-roots-submit", txHash: ackTx }));
    await ag.waitForTransaction(ackTx);
  }
  const ackAfter = await ag.ackStatus();
  if (!ackAfter.allAcked) {
    throw new Error(`Agentic ID trust-root acknowledgement incomplete after transaction: ${ackAfter.missing.join(", ")}`);
  }
  console.log(JSON.stringify({ phase: "preflight-trust-roots-complete", allAcked: true }));
}

let sandboxBalanceWei = await ag.getBalance();
console.log(JSON.stringify({
  phase: "preflight-sandbox-balance",
  balanceWei: sandboxBalanceWei.toString(),
  minimumWei: MIN_SANDBOX_BALANCE_WEI.toString(),
  targetWei: TARGET_SANDBOX_BALANCE_WEI.toString(),
}));
if (sandboxBalanceWei < TARGET_SANDBOX_BALANCE_WEI) {
  const amountWei = TARGET_SANDBOX_BALANCE_WEI - sandboxBalanceWei;
  const depositTx = await ag.deposit({ amountWei });
  console.log(JSON.stringify({
    phase: "preflight-sandbox-deposit-submit",
    amountWei: amountWei.toString(),
    txHash: depositTx,
  }));
  await ag.waitForTransaction(depositTx);
  sandboxBalanceWei = await ag.getBalance();
  if (sandboxBalanceWei < MIN_SANDBOX_BALANCE_WEI) {
    throw new Error(`Agentic ID sandbox balance remains below 0.1 OG after deposit: ${sandboxBalanceWei} wei`);
  }
  console.log(JSON.stringify({
    phase: "preflight-sandbox-deposit-complete",
    balanceWei: sandboxBalanceWei.toString(),
  }));
}

console.log(JSON.stringify({
  phase: "provision-start",
  attestorUrl,
  framework,
  model,
  provider: "openrouter",
  idempotencyKey,
  trustRootsAcked: true,
  sandboxBalanceWei: sandboxBalanceWei.toString(),
}));

const deployment = await ag.agent.deploy({
  name,
  description: "ReceiptGate Hackathon agent: produces externally verifiable service receipts before autonomous side effects.",
  framework,
  iData,
  sandbox: { apiKey: agentApiKey },
  idempotencyKey,
}, { wait: "running" }) as any;

if (!deployment?.url || deployment?.agentId == null) throw new Error("Agentic ID deploy reached no running URL/agentId");
const { hello, verification } = await ag.agent.sayHi(deployment.url);
if (!verification?.ok) throw new Error(`running Agentic ID /hello failed verification: ${verification?.reasons?.join("; ") ?? "missing proof"}`);

const receipt = {
  schema: "receiptgate-agentic-id-provision-v1",
  accepted: true,
  attestorUrl,
  agentId: String(deployment.agentId),
  sealId: deployment.sealId,
  agentSealAddr: deployment.agentSealAddr,
  url: deployment.url,
  framework,
  model,
  idempotencyKey,
  preflight: {
    trustRootsAcked: true,
    sandboxBalanceWei: sandboxBalanceWei.toString(),
    minimumSandboxBalanceWei: MIN_SANDBOX_BALANCE_WEI.toString(),
  },
  hello: {
    agent: hello.agent,
    owner: hello.owner,
    services: Array.isArray(hello.services) ? hello.services.map((service: any) => ({ path: service.path, method: service.method })) : [],
  },
  verification: {
    ok: verification.ok,
    signerMatches: verification.signerMatches,
    notExpired: verification.notExpired,
    dataOnChain: verification.dataOnChain,
  },
  generatedAt: new Date().toISOString(),
};

await mkdir("artifacts", { recursive: true });
await Bun.write("artifacts/agentic-id-provision.json", JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({ phase: "provision-complete", agentId: receipt.agentId, url: receipt.url, framework, model, proofOk: receipt.verification.ok, serviceCount: receipt.hello.services.length }));
