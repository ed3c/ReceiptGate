const baseUrl = (process.env.RECEIPTGATE_BASE_URL || "https://receiptgate.vercel.app").replace(/\/+$/, "");
const expectedWallet = "0x5688FE84cf3f3B7E37e31F6205C619EE06B6925A";
const expectedModel = "0GM-1.0-35B-A3B";

async function getJson(path: string) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(10_000) });
  let body: any = null;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const [config, wallet] = await Promise.all([
  getJson("/api/config"),
  getJson("/api/wallet/readiness"),
]);

const blockers: Array<{ boundary: string; next: string }> = [];
if (wallet.live !== true || wallet.chainId !== 16602 || wallet.address?.toLowerCase() !== expectedWallet.toLowerCase()) {
  blockers.push({ boundary: "GALILEO_WALLET_READBACK", next: "Fix public wallet/chain readiness before any provisioning." });
}
if (config.computeConfigured !== true) {
  blockers.push({ boundary: "0G_PRIVATE_COMPUTER_RUNTIME", next: "Connect/deposit in pc.testnet.0g.ai, create Private API key, then configure Vercel ZG_SERVICE_URL/ZG_MODEL/ZG_API_SECRET." });
} else if (config.computeTransport !== "0g-router") {
  blockers.push({ boundary: "0G_ROUTER_TRANSPORT", next: "Use a recognized HTTPS 0G Router /v1 URL matching the API key network; do not switch testnet keys to mainnet." });
}
if (config.computeConfigured === true && (config.computeModel || "").toLowerCase() !== expectedModel.toLowerCase()) {
  blockers.push({ boundary: "0G_MODEL", next: `Configured ${config.computeModel} is an inference model, not evidence of Private ${expectedModel} availability. Provision a compatible private model/provider; never fall back to Standard for private routes.` });
}
if (config.demoWallet?.serverEnforced !== true) {
  blockers.push({ boundary: "DEMO_WALLET_ALLOWLIST", next: `Before final locked demo, set DEMO_ALLOWED_WALLETS=${expectedWallet} in Vercel Production. This is public configuration; never set PRIVATE_KEY.` });
}
if (config.agentConfigured !== true) {
  blockers.push({ boundary: "AGENTIC_ID", next: "After Compute is LIVE, provision Agentic ID locally with the securely stored disposable-wallet key." });
} else if (config.serveProofConfigured !== true) {
  blockers.push({ boundary: "CANDIDATE_SERVEPROOF", next: "Register /api/receiptgate in the running Agentic ID sandbox and configure RECEIPTGATE_AGENT_SERVICE_PATH." });
}

const receipt = {
  schema: "receiptgate-runtime-unlock-status-v1",
  baseUrl,
  generatedAt: new Date().toISOString(),
  wallet: {
    address: wallet.address,
    chainId: wallet.chainId,
    balanceOG: wallet.balanceOG,
    funding: wallet.funding,
  },
  compute: {
    configured: config.computeConfigured === true,
    transport: config.computeTransport,
    network: config.computeNetwork,
    model: config.computeModel,
  },
  demoWallet: config.demoWallet,
  agent: {
    configured: config.agentConfigured === true,
    serveProofConfigured: config.serveProofConfigured === true,
  },
  blockers,
  ready: blockers.length === 0,
  proofBoundary: "This status reads public/runtime configuration only. It never reads or accepts an EOA private key or Router API secret.",
};

console.log(JSON.stringify(receipt, null, 2));
