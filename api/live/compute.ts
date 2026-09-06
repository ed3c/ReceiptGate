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

export default {
  async fetch(request: Request) {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        address?: string;
        message?: string;
        signature?: string;
      };

      // Public spend guard must execute before loading wallet/provider modules.
      if (!body.address || !body.message || !body.signature) {
        return json({ live: false, authorized: false, error: "wallet authorization required" }, 401);
      }

      const { verifyWalletAuthorization, walletAllowed } = await import("../../demo/wallet.ts");
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

      const { liveComputeEvidence } = await import("../../demo/live.ts");
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
