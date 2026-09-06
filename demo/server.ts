import { runFixtureScenario } from "./fixture";
import { liveAgentEvidence, liveComputeEvidence } from "./live";
import walletChallengeApi from "../api/wallet/challenge";
import walletVerifyApi from "../api/wallet/verify";

if (process.env.GITHUB_ACTIONS === "true" && process.env.PRIVATE_KEY?.trim()) {
  throw new Error("PRIVATE_KEY must not enter the judge-demo GitHub Actions runtime");
}

const GALILEO_CHAIN_ID = 16602;
const GALILEO_CHAIN_HEX = "0x40da";
const GALILEO_RPC_URL = "https://evmrpc-testnet.0g.ai";
const GALILEO_EXPLORER = "https://chainscan-galileo.0g.ai";
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

function validAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function walletAllowed(address: string): boolean {
  const configured = process.env.DEMO_ALLOWED_WALLETS?.trim();
  if (!configured) return true;
  return configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => validAddress(value))
    .includes(address.toLowerCase());
}

async function verifyWallet(request: Request, body: { address: string; message: string; signature: string }) {
  const verificationRequest = new Request(new URL("/api/wallet/verify", request.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await walletVerifyApi.fetch(verificationRequest);
  const receipt = await response.json() as any;
  return { response, receipt };
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
        return walletChallengeApi.fetch(request);
      }
      if (request.method === "POST" && url.pathname === "/api/wallet/verify") {
        return walletVerifyApi.fetch(request);
      }
      if (request.method === "POST" && url.pathname === "/api/live/compute") {
        const body = await request.json().catch(() => ({})) as { address?: string; message?: string; signature?: string };
        if (!body.address || !body.message || !body.signature) {
          return json({ live: false, authorized: false, error: "wallet authorization required" }, 401);
        }
        const { response, receipt: wallet } = await verifyWallet(request, {
          address: body.address,
          message: body.message,
          signature: body.signature,
        });
        if (response.status !== 200 || wallet?.ok !== true || wallet?.checks?.signature !== true) {
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
            verificationTransport: wallet.verificationTransport,
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
