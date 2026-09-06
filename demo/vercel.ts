import { runFixtureScenario } from "./fixture";
import { liveAgentEvidence, liveComputeEvidence } from "./live";
import { createWalletChallenge, GALILEO_CHAIN_HEX, GALILEO_CHAIN_ID, GALILEO_EXPLORER, GALILEO_RPC_URL, verifyWalletAuthorization, walletAllowed } from "./wallet";

function json(value: unknown, status = 200): Response { return Response.json(value, { status, headers: { "cache-control": "no-store" } }); }
function safeError(error: unknown): string { const message = error instanceof Error ? error.message : String(error); return message.replace(/app-sk-[A-Za-z0-9._-]+/g, "[redacted-api-secret]").replace(/0x[a-fA-F0-9]{64}/g, "[redacted-private-material]").slice(0, 400); }
function requestOrigin(request: Request): string { return new URL(request.url).origin; }

export async function configHandler() {
  return json({
    computeConfigured: Boolean(process.env.ZG_SERVICE_URL?.trim() && process.env.ZG_MODEL?.trim() && process.env.ZG_API_SECRET?.trim()),
    agentConfigured: Boolean(process.env.RECEIPTGATE_AGENT_URL?.trim()),
    walletAuthorizationRequiredForCompute: true,
    walletAllowlistEnabled: Boolean(process.env.DEMO_ALLOWED_WALLETS?.trim()),
    wallet: { chainId: GALILEO_CHAIN_ID, chainHex: GALILEO_CHAIN_HEX, rpcUrl: GALILEO_RPC_URL, explorer: GALILEO_EXPLORER, nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 } },
  });
}
export async function healthHandler() {
  return json({
    ok: true,
    service: "receiptgate-vercel-bun",
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    environment: process.env.VERCEL_TARGET_ENV ?? process.env.VERCEL_ENV ?? null,
  });
}
export async function demoHandler(request: Request) { try { const body = (await request.json().catch(() => ({}))) as { tamper?: boolean }; return json(await runFixtureScenario(body.tamper === true)); } catch (error) { return json({ error: safeError(error) }, 503); } }

export async function liveComputeHandler(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { address?: string; message?: string; signature?: string };
    if (!body.address || !body.message || !body.signature) return json({ live: false, authorized: false, error: "wallet authorization required" }, 401);
    const wallet = await verifyWalletAuthorization({ address: body.address, message: body.message, signature: body.signature, expectedOrigin: requestOrigin(request) });
    if (!wallet.ok) return json({ live: false, authorized: false, error: "wallet authorization failed", wallet }, 401);
    if (!walletAllowed(wallet.address)) return json({ live: false, authorized: false, error: "wallet is not admitted to sponsored Compute", wallet: { address: wallet.address, chainId: wallet.chainId } }, 403);
    const result = await liveComputeEvidence();
    return json({ ...result, authorized: true, walletAuthorization: { address: wallet.address, chainId: wallet.chainId, checks: wallet.checks } });
  } catch (error) { return json({ configured: true, live: false, authorized: false, error: safeError(error) }, 503); }
}

export async function liveAgentHandler() { try { return json(await liveAgentEvidence()); } catch (error) { return json({ configured: true, live: false, error: safeError(error) }, 503); } }
export async function walletChallengeHandler(request: Request) { try { const address = new URL(request.url).searchParams.get("address") ?? ""; return json(createWalletChallenge(address, requestOrigin(request))); } catch (error) { return json({ error: safeError(error) }, 400); } }
export async function walletVerifyHandler(request: Request) {
  try {
    const body = (await request.json()) as { address?: string; message?: string; signature?: string };
    if (!body.address || !body.message || !body.signature) return json({ error: "address, message and signature are required" }, 400);
    const receipt = await verifyWalletAuthorization({ address: body.address, message: body.message, signature: body.signature, expectedOrigin: requestOrigin(request) });
    return json(receipt, receipt.ok ? 200 : 401);
  } catch (error) { return json({ error: safeError(error) }, 400); }
}
