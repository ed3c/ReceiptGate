import { classifyComputeTransport, routerNetwork } from "../adapters/0g/compute/transport";

const GALILEO_CHAIN_ID = 16602;
const GALILEO_CHAIN_HEX = "0x40da";
const GALILEO_RPC_URL = "https://evmrpc-testnet.0g.ai";
const GALILEO_EXPLORER = "https://chainscan-galileo.0g.ai";
const RECEIPTGATE_DEMO_WALLET = "0x5688FE84cf3f3B7E37e31F6205C619EE06B6925A";

function computeTransport(serviceUrl?: string): "0g-router" | "0g-compute-provider" | "none" {
  const value = serviceUrl?.trim();
  if (!value) return "none";
  return classifyComputeTransport(value);
}

function allowedWallets(value?: string): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^0x[0-9a-f]{40}$/.test(item));
}

export default {
  async fetch() {
    const serviceUrl = process.env.ZG_SERVICE_URL?.trim();
    const model = process.env.ZG_MODEL?.trim();
    const apiSecret = process.env.ZG_API_SECRET?.trim();
    const agentUrl = process.env.RECEIPTGATE_AGENT_URL?.trim();
    const agentServicePath = process.env.RECEIPTGATE_AGENT_SERVICE_PATH?.trim();
    const transport = computeTransport(serviceUrl);
    const configuredAllowlist = allowedWallets(process.env.DEMO_ALLOWED_WALLETS);
    const demoWalletServerEnforced = configuredAllowlist.length === 1
      && configuredAllowlist[0] === RECEIPTGATE_DEMO_WALLET.toLowerCase();

    return Response.json({
      computeConfigured: Boolean(serviceUrl && model && apiSecret),
      computeTransport: transport,
      computeNetwork: serviceUrl ? routerNetwork(serviceUrl) : null,
      computeModel: model || null,
      agentConfigured: Boolean(agentUrl),
      serveProofConfigured: Boolean(agentUrl && agentServicePath),
      serveProofServicePath: agentServicePath || null,
      walletAuthorizationRequiredForCompute: true,
      walletAllowlistEnabled: configuredAllowlist.length > 0,
      demoWallet: {
        mode: "single-wallet-hackathon",
        address: RECEIPTGATE_DEMO_WALLET,
        serverEnforced: demoWalletServerEnforced,
        readinessUrl: "/api/wallet/readiness",
        privateKeyBoundary: "local-or-human-wallet-only-never-vercel",
      },
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
