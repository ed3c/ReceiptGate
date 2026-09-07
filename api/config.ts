const GALILEO_CHAIN_ID = 16602;
const GALILEO_CHAIN_HEX = "0x40da";
const GALILEO_RPC_URL = "https://evmrpc-testnet.0g.ai";
const GALILEO_EXPLORER = "https://chainscan-galileo.0g.ai";

function computeTransport(serviceUrl?: string): "0g-router" | "0g-compute-provider" | "none" {
  const value = serviceUrl?.trim();
  if (!value) return "none";
  try {
    const url = new URL(value);
    if (url.hostname === "router-api.0g.ai") return "0g-router";
  } catch {
    // Shape validation happens when the live request is constructed.
  }
  return "0g-compute-provider";
}

export default {
  async fetch() {
    const serviceUrl = process.env.ZG_SERVICE_URL?.trim();
    const model = process.env.ZG_MODEL?.trim();
    const apiSecret = process.env.ZG_API_SECRET?.trim();
    const agentUrl = process.env.RECEIPTGATE_AGENT_URL?.trim();
    const agentServicePath = process.env.RECEIPTGATE_AGENT_SERVICE_PATH?.trim();
    const transport = computeTransport(serviceUrl);

    return Response.json({
      computeConfigured: Boolean(serviceUrl && model && apiSecret),
      computeTransport: transport,
      computeModel: model || null,
      agentConfigured: Boolean(agentUrl),
      serveProofConfigured: Boolean(agentUrl && agentServicePath),
      serveProofServicePath: agentServicePath || null,
      walletAuthorizationRequiredForCompute: true,
      walletAllowlistEnabled: Boolean(process.env.DEMO_ALLOWED_WALLETS?.trim()),
      wallet: {
        chainId: GALILEO_CHAIN_ID,
        chainHex: GALILEO_CHAIN_HEX,
        rpcUrl: GALILEO_RPC_URL,
        explorer: GALILEO_EXPLORER,
        nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
      },
    }, { headers: { "cache-control": "no-store" } });
  },
};
