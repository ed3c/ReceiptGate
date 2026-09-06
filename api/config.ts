const GALILEO_CHAIN_ID = 16602;
const GALILEO_CHAIN_HEX = "0x40da";
const GALILEO_RPC_URL = "https://evmrpc-testnet.0g.ai";
const GALILEO_EXPLORER = "https://chainscan-galileo.0g.ai";

export default {
  async fetch() {
    return Response.json({
      computeConfigured: Boolean(
        process.env.ZG_SERVICE_URL?.trim() &&
          process.env.ZG_MODEL?.trim() &&
          process.env.ZG_API_SECRET?.trim(),
      ),
      agentConfigured: Boolean(process.env.RECEIPTGATE_AGENT_URL?.trim()),
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
