import { verifyWalletAuthorization } from "../../demo/wallet.ts";

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/0x[a-fA-F0-9]{64}/g, "[redacted-private-material]").slice(0, 400);
}

export default {
  async fetch(request: Request) {
    try {
      const body = (await request.json()) as { address?: string; message?: string; signature?: string };
      if (!body.address || !body.message || !body.signature) {
        return Response.json({ error: "address, message and signature are required" }, { status: 400 });
      }
      const receipt = await verifyWalletAuthorization({
        address: body.address,
        message: body.message,
        signature: body.signature,
        expectedOrigin: new URL(request.url).origin,
      });
      return Response.json(receipt, {
        status: receipt.ok ? 200 : 401,
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      return Response.json({ error: safeError(error) }, { status: 400 });
    }
  },
};
