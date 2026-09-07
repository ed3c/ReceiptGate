const GALILEO_CHAIN_ID = 16602;
const GALILEO_CHAIN_HEX = "0x40da";
const GALILEO_RPC_URL = "https://evmrpc-testnet.0g.ai";
export const RECEIPTGATE_DEMO_WALLET = "0x5688FE84cf3f3B7E37e31F6205C619EE06B6925A";

const OG = 10n ** 18n;
const AGENTIC_ID_SANDBOX_TARGET_WEI = 2n * 10n ** 17n; // 0.2 OG
const LEGACY_COMPUTE_FALLBACK_WEI = 4n * OG;
const HACKATHON_RESERVE_TARGET_WEI = 10n * OG;

async function rpc(method: string, params: unknown[] = []): Promise<string> {
  const response = await fetch(GALILEO_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8_000),
  });
  const body = (await response.json()) as { result?: unknown; error?: unknown };
  if (!response.ok || body.error || typeof body.result !== "string") {
    throw new Error(`${method} failed`);
  }
  return body.result;
}

export function formatOg(wei: bigint): string {
  const whole = wei / OG;
  const fraction = (wei % OG).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function fundingReadiness(wei: bigint) {
  return {
    agenticIdSandboxTarget: {
      targetOG: "0.2",
      ready: wei >= AGENTIC_ID_SANDBOX_TARGET_WEI,
      semantics: "Local Agentic ID provisioning preflight target; actual spend should follow runtime readback.",
    },
    legacyComputeFallback: {
      targetOG: "4",
      ready: wei >= LEGACY_COMPUTE_FALLBACK_WEI,
      semantics: "Fallback-only legacy Compute bootstrap reserve; do not spend when Private Computer Router is working.",
    },
    hackathonReserve: {
      targetOG: "10",
      ready: wei >= HACKATHON_RESERVE_TARGET_WEI,
      semantics: "Operational reserve target only; Galileo native OG is not the same as Private Computer inference credit.",
    },
  };
}

export default {
  async fetch() {
    try {
      const [chainIdHex, balanceHex] = await Promise.all([
        rpc("eth_chainId"),
        rpc("eth_getBalance", [RECEIPTGATE_DEMO_WALLET, "latest"]),
      ]);
      const chainId = Number(BigInt(chainIdHex));
      if (chainId !== GALILEO_CHAIN_ID || chainIdHex.toLowerCase() !== GALILEO_CHAIN_HEX) {
        throw new Error(`unexpected Galileo chain ${chainId}`);
      }
      const balanceWei = BigInt(balanceHex);
      return Response.json({
        schema: "receiptgate-demo-wallet-readiness-v1",
        live: true,
        network: "0G Galileo Testnet",
        chainId,
        rpcUrl: GALILEO_RPC_URL,
        address: RECEIPTGATE_DEMO_WALLET,
        balanceHex,
        balanceWei: balanceWei.toString(),
        balanceOG: formatOg(balanceWei),
        funding: fundingReadiness(balanceWei),
        proofBoundary: "Public Galileo chain-state readback only. This proves neither private-key control nor Private Computer Main Account credit.",
      }, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({
        schema: "receiptgate-demo-wallet-readiness-v1",
        live: false,
        address: RECEIPTGATE_DEMO_WALLET,
        error: message.slice(0, 300),
      }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  },
};
