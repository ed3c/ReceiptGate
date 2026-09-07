import { describe, expect, test } from "bun:test";
import routeHandler, { selectProofRoute, sha256Hex, chatCompletionsUrl } from "../api/live/proof-route";

describe("proof-aware deterministic routing", () => {
  test("financial side effects require private 0GM", async () => {
    const route = selectProofRoute("financial-side-effect");
    expect(route.model).toBe("0GM-1.0-35B-A3B");
    expect(route.trustMode).toBe("private");
    expect(route.requiredProof.inferenceAttestation).toBe(true);
    expect(route.requiredProof.privateInference).toBe(true);
    expect(await sha256Hex(route)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("capability benchmarks also require private inference", () => {
    const route = selectProofRoute("capability-benchmark");
    expect(route.model).toBe("0GM-1.0-35B-A3B");
    expect(route.trustMode).toBe("private");
    expect(route.riskClass).toBe("medium");
  });

  test("read-only research can use verified routing", () => {
    const route = selectProofRoute("read-only-research");
    expect(route.model).toBe("DeepSeek-V4-Pro-0813");
    expect(route.trustMode).toBe("verified");
    expect(route.requiredProof.privateInference).toBe(false);
  });

  test("0G Router chat endpoint is exact", () => {
    expect(chatCompletionsUrl("https://router-api.0g.ai/v1")).toBe("https://router-api.0g.ai/v1/chat/completions");
  });

  test("anonymous sponsored route fails before provider", async () => {
    const response = await routeHandler.fetch(new Request("https://receiptgate.example/api/live/proof-route", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.authorized).toBe(false);
  });

  test("judging page exposes machine-readable operator surface", async () => {
    const html = await Bun.file("public/routing.html").text();
    expect(html).toContain("PROOF-AWARE ROUTING");
    expect(html).toContain("ReceiptGateProofRouter");
    expect(html).toContain("X-0G-Provider-Trust-Mode");
  });
});

test("testnet routing preserves Private requirements and never retries in Standard mode", async () => {
  const saved = Object.fromEntries(["ZG_SERVICE_URL", "ZG_API_SECRET", "ZG_PRIVATE_MODEL", "DEMO_ALLOWED_WALLETS"].map(key => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  try {
    process.env.ZG_SERVICE_URL = "https://router-api-testnet.integratenetwork.work/v1";
    process.env.ZG_API_SECRET = "sk-test";
    delete process.env.ZG_PRIVATE_MODEL;
    delete process.env.DEMO_ALLOWED_WALLETS;
    for (const providerStatus of [200, 404, 403, 503]) {
      let providerCalls = 0;
      globalThis.fetch = (async (url: any, options: any) => {
        if (String(url).endsWith("/api/wallet/verify")) return Response.json({ ok: true, address: "0x" + "1".repeat(40), checks: { signature: true } });
        providerCalls++;
        expect(String(url)).toBe("https://router-api-testnet.integratenetwork.work/v1/chat/completions");
        expect(options.headers["X-0G-Provider-Trust-Mode"]).toBe("private");
        expect(JSON.parse(options.body).model).toBe("0GM-1.0-35B-A3B");
        return providerStatus === 200
          ? Response.json({ choices: [{ message: { content: "mock inference, not attestation" } }] })
          : Response.json({ error: "required model/trust mode unavailable" }, { status: providerStatus });
      }) as typeof fetch;
      const response = await routeHandler.fetch(new Request("https://receiptgate.example/api/live/proof-route", { method: "POST", body: JSON.stringify({ address: "0x" + "1".repeat(40), message: "mock authorization", signature: "mock", taskClass: "financial-side-effect" }) }));
      const body = await response.json();
      expect(providerCalls).toBe(1);
      if (providerStatus === 200) {
        expect(response.status).toBe(200);
        expect(body.network).toBe("testnet");
        expect(body.route.requiredProof.privateInference).toBe(true);
        expect(body.inferenceProofVerified).toBe(false);
      } else {
        expect(response.status).toBe(503);
        expect(body.live).toBe(false);
        expect(body.error).toContain(`testnet HTTP ${providerStatus}`);
        expect(body.error).toContain("no Standard/model fallback");
      }
    }
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
