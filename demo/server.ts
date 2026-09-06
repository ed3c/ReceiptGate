import { runFixtureScenario } from "./fixture";
import { liveAgentEvidence, liveComputeEvidence } from "./live";
import {
  createWalletChallenge,
  GALILEO_CHAIN_HEX,
  GALILEO_CHAIN_ID,
  GALILEO_EXPLORER,
  GALILEO_RPC_URL,
  verifyWalletAuthorization,
  walletAllowed,
} from "./wallet";

if (process.env.GITHUB_ACTIONS === "true" && process.env.PRIVATE_KEY?.trim()) {
  throw new Error("PRIVATE_KEY must not enter the judge-demo GitHub Actions runtime");
}

const port = Number(process.env.DEMO_PORT ?? 3000);
const html = await Bun.file(new URL("./index.html", import.meta.url)).text();

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/app-sk-[A-Za-z0-9._-]+/g, "[redacted-api-secret]")
    .replace(/0x[a-fA-F0-9]{64}/g, "[redacted-private-material]")
    .slice(0, 400);
}

function requestOrigin(request: Request): string {
  return new URL(request.url).origin;
}

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/") {
        return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
      }
      if (request.method === "GET" && url.pathname === "/healthz") {
        return json({ ok: true, service: "receiptgate-demo", port });
      }
      if (request.method === "GET" && url.pathname === "/api/config") {
        return json({
          computeConfigured: Boolean(process.env.ZG_SERVICE_URL?.trim() && process.env.ZG_MODEL?.trim() && process.env.ZG_API_SECRET?.trim()),
          agentConfigured: Boolean(process.env.RECEIPTGATE_AGENT_URL?.trim()),
          privateKeyInRuntime: Boolean(process.env.PRIVATE_KEY?.trim()),
          walletAuthorizationRequiredForCompute: true,
          walletAllowlistEnabled: Boolean(process.env.DEMO_ALLOWED_WALLETS?.trim()),
          wallet: {
            chainId: GALILEO_CHAIN_ID,
            chainHex: GALILEO_CHAIN_HEX,
            rpcUrl: GALILEO_RPC_URL,
            explorer: GALILEO_EXPLORER,
            nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
          },
        });
      }
      if (request.method === "POST" && url.pathname === "/api/demo") {
        const body = await request.json().catch(() => ({})) as { tamper?: boolean };
        return json(await runFixtureScenario(body.tamper === true));
      }
      if (request.method === "GET" && url.pathname === "/api/wallet/challenge") {
        const address = url.searchParams.get("address") ?? "";
        return json(createWalletChallenge(address, requestOrigin(request)));
      }
      if (request.method === "POST" && url.pathname === "/api/wallet/verify") {
        const body = await request.json().catch(() => ({})) as { address?: string; message?: string; signature?: string };
        if (!body.address || !body.message || !body.signature) {
          return json({ error: "address, message and signature are required" }, 400);
        }
        const receipt = await verifyWalletAuthorization({
          address: body.address,
          message: body.message,
          signature: body.signature,
          expectedOrigin: requestOrigin(request),
        });
        return json(receipt, receipt.ok ? 200 : 401);
      }
      if (request.method === "POST" && url.pathname === "/api/live/compute") {
        const body = await request.json().catch(() => ({})) as { address?: string; message?: string; signature?: string };
        if (!body.address || !body.message || !body.signature) {
          return json({ live: false, authorized: false, error: "wallet authorization required" }, 401);
        }
        const wallet = await verifyWalletAuthorization({
          address: body.address,
          message: body.message,
          signature: body.signature,
          expectedOrigin: requestOrigin(request),
        });
        if (!wallet.ok) {
          return json({ live: false, authorized: false, error: "wallet authorization failed", wallet }, 401);
        }
        if (!walletAllowed(wallet.address)) {
          return json({
            live: false,
            authorized: false,
            error: "wallet is not admitted to sponsored Compute",
            wallet: { address: wallet.address, chainId: wallet.chainId },
          }, 403);
        }
        const result = await liveComputeEvidence();
        return json({
          ...result,
          authorized: true,
          walletAuthorization: {
            address: wallet.address,
            chainId: wallet.chainId,
            checks: wallet.checks,
          },
        });
      }
      if (request.method === "GET" && url.pathname === "/api/live/agent") {
        return json(await liveAgentEvidence());
      }
      return json({ error: "not found" }, 404);
    } catch (error) {
      return json({ error: safeError(error) }, 503);
    }
  },
});

console.log(JSON.stringify({ schema: "receiptgate-demo-server-v1", listening: true, port: server.port, privateKeyInRuntime: false }));
