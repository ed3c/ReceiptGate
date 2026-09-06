import { evaluatePolicy } from "../../core/policy.ts";
import { ZeroGComputeClient } from "../../adapters/0g/compute/client.ts";
import { verifyWalletAuthorization, walletAllowed } from "../../demo/wallet.ts";

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

async function liveComputeEvidence() {
  const serviceUrl = process.env.ZG_SERVICE_URL?.trim();
  const apiSecret = process.env.ZG_API_SECRET?.trim();
  const model = process.env.ZG_MODEL?.trim();
  if (!serviceUrl || !apiSecret || !model) {
    return { configured: false, live: false, reason: "ZG_SERVICE_URL / ZG_MODEL / ZG_API_SECRET not configured" };
  }

  const client = new ZeroGComputeClient({ serviceUrl, apiSecret, model });
  const candidate = await client.proposePurchase({
    id: "hackathon-gpu-credits-live",
    units: 10_000,
    maxBudget: 300,
    currency: "USD",
    product: "GPU inference credits",
  });
  const policy = evaluatePolicy(candidate, { maxAmount: 300, allowedKinds: ["purchase"] });
  return {
    configured: true,
    live: true,
    provider: "0g-compute",
    model,
    candidate,
    policy,
    proofBoundary: "none-live-compute-only",
  };
}

export default {
  async fetch(request: Request) {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        address?: string;
        message?: string;
        signature?: string;
      };

      if (!body.address || !body.message || !body.signature) {
        return json({ live: false, authorized: false, error: "wallet authorization required" }, 401);
      }

      const wallet = await verifyWalletAuthorization({
        address: body.address,
        message: body.message,
        signature: body.signature,
        expectedOrigin: new URL(request.url).origin,
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
        walletAuthorization: { address: wallet.address, chainId: wallet.chainId, checks: wallet.checks },
      });
    } catch (error) {
      return json({ configured: true, live: false, authorized: false, error: safeError(error) }, 503);
    }
  },
};
