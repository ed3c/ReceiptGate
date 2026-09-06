function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/0x[a-fA-F0-9]{64}/g, "[redacted-private-material]").slice(0, 400);
}

export default {
  async fetch() {
    const agentUrl = process.env.RECEIPTGATE_AGENT_URL?.trim();
    if (!agentUrl) {
      return json({ configured: false, live: false, reason: "RECEIPTGATE_AGENT_URL not configured" });
    }

    try {
      const attestorUrl = process.env.ZERO_G_ATTESTOR_URL?.trim() || "https://agenticid.0g.ai";
      const { AgenticID } = await import("@0gfoundation/0g-agenticid-sdk");
      const ag = await AgenticID.fromAttestor(attestorUrl);
      const { hello, verification } = await ag.agent.sayHi(agentUrl);
      return json({
        configured: true,
        live: Boolean(verification?.ok),
        agentId: hello?.agent ?? null,
        owner: hello?.owner ?? null,
        serviceCount: Array.isArray(hello?.services) ? hello.services.length : 0,
        services: Array.isArray(hello?.services)
          ? hello.services.map((service: any) => ({ path: service.path, method: service.method }))
          : [],
        verification: verification
          ? {
              ok: verification.ok,
              signerMatches: verification.signerMatches,
              notExpired: verification.notExpired,
              dataOnChain: verification.dataOnChain,
              reasons: verification.reasons,
            }
          : null,
        proofBoundary: "live-0g-agentic-id-signed-hello",
      });
    } catch (error) {
      return json({ configured: true, live: false, error: safeError(error) }, 503);
    }
  },
};
