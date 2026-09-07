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
