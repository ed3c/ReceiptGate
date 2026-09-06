import { evaluatePolicy } from "../core/policy";
import { ZeroGComputeClient } from "../adapters/0g/compute/client";

export async function liveComputeEvidence() {
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

export async function liveAgentEvidence() {
  const agentUrl = process.env.RECEIPTGATE_AGENT_URL?.trim();
  if (!agentUrl) return { configured: false, live: false, reason: "RECEIPTGATE_AGENT_URL not configured" };
  const attestorUrl = process.env.ZERO_G_ATTESTOR_URL?.trim() || "https://agenticid.0g.ai";
  const { AgenticID } = await import("@0gfoundation/0g-agenticid-sdk");
  const ag = await AgenticID.fromAttestor(attestorUrl);
  const { hello, verification } = await ag.agent.sayHi(agentUrl);
  return {
    configured: true,
    live: Boolean(verification?.ok),
    agentId: hello?.agent ?? null,
    owner: hello?.owner ?? null,
    serviceCount: Array.isArray(hello?.services) ? hello.services.length : 0,
    services: Array.isArray(hello?.services) ? hello.services.map((s: any) => ({ path: s.path, method: s.method })) : [],
    verification: verification ? {
      ok: verification.ok,
      signerMatches: verification.signerMatches,
      notExpired: verification.notExpired,
      dataOnChain: verification.dataOnChain,
      reasons: verification.reasons,
    } : null,
    proofBoundary: "live-0g-agentic-id-signed-hello",
  };
}
