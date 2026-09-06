import { createWalletChallenge } from "../../demo/wallet.ts";

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/0x[a-fA-F0-9]{64}/g, "[redacted-private-material]").slice(0, 400);
}

export default {
  async fetch(request: Request) {
    try {
      const url = new URL(request.url);
      const address = url.searchParams.get("address") ?? "";
      return Response.json(createWalletChallenge(address, url.origin), {
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      return Response.json({ error: safeError(error) }, { status: 400 });
    }
  },
};
