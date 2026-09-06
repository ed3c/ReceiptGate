const GALILEO_CHAIN_ID = 16602;
const WALLET_AUTH_TTL_MS = 2 * 60_000;
const CANDIDATE_HASH = "f27d90312829eea02c99774da14dbc7e7cce47907f708b5bb099987d4e1aa110";
const CANDIDATE = {
  id: "hackathon-gpu-credits-wallet-001",
  kind: "purchase",
  target: "0G GPU inference credits",
  amount: 247,
  currency: "USD",
  payload: { units: 10_000, product: "GPU inference credits" },
};

function validAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export default {
  async fetch(request: Request) {
    try {
      const url = new URL(request.url);
      const address = url.searchParams.get("address") ?? "";
      if (!validAddress(address)) {
        return Response.json({ error: "valid wallet address is required" }, { status: 400 });
      }
      const issuedAtMs = Date.now();
      const expiresAtMs = issuedAtMs + WALLET_AUTH_TTL_MS;
      const nonce = crypto.randomUUID();
      const wallet = address;
      const message = [
        "ReceiptGate Wallet Authorization v1",
        `wallet=${wallet}`,
        `chainId=${GALILEO_CHAIN_ID}`,
        `candidateId=${CANDIDATE.id}`,
        `candidateHash=${CANDIDATE_HASH}`,
        `amount=${CANDIDATE.amount}`,
        `currency=${CANDIDATE.currency}`,
        `origin=${url.origin}`,
        `issuedAtMs=${issuedAtMs}`,
        `expiresAtMs=${expiresAtMs}`,
        `nonce=${nonce}`,
      ].join("\n");
      return Response.json({
        schema: "receiptgate-wallet-challenge-v2",
        wallet,
        chainId: GALILEO_CHAIN_ID,
        candidate: CANDIDATE,
        candidateHash: CANDIDATE_HASH,
        origin: url.origin,
        issuedAtMs,
        expiresAtMs,
        nonce,
        message,
      }, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ error: message.slice(0, 400) }, { status: 400 });
    }
  },
};
