import { describe, expect, test } from "bun:test";
import { ZeroGComputeClient } from "../adapters/0g/compute/client";
import { executeWithReceipt } from "../core/gate";
import { fixtureVerifier, makeFixtureProof } from "./support/fixtureVerifier";

function response(content: unknown, status = 200): Response {
  return new Response(
    status >= 200 && status < 300
      ? JSON.stringify({ choices: [{ message: { content } }] })
      : String(content),
    { status, headers: { "content-type": "application/json" } },
  );
}

function client(content: unknown, status = 200) {
  return new ZeroGComputeClient({
    serviceUrl: "https://provider.example/v1/proxy",
    apiSecret: "app-sk-test",
    model: "test-model",
    fetchImpl: async () => response(content, status),
  });
}

const request = {
  id: "purchase-001",
  units: 10_000,
  maxBudget: 300,
  currency: "USD",
  product: "GPU inference credits",
};

const validDecision = JSON.stringify({
  target: "provider-a",
  amount: 247,
  currency: "USD",
  risk: "low",
  reason: "within budget",
});

describe("0G Compute candidate adapter", () => {
  test("strict JSON completion maps to exact candidate", async () => {
    const candidate = await client(validDecision).proposePurchase(request);
    expect(candidate.id).toBe("purchase-001");
    expect(candidate.kind).toBe("purchase");
    expect(candidate.target).toBe("provider-a");
    expect(candidate.amount).toBe(247);
    expect(candidate.currency).toBe("USD");
    expect(candidate.payload?.units).toBe(10_000);
    expect(candidate.payload?.computeModel).toBe("test-model");
  });

  test("markdown or prose-wrapped model output is rejected", async () => {
    await expect(
      client(`\`\`\`json\n${validDecision}\n\`\`\``).proposePurchase(request),
    ).rejects.toThrow("strict JSON");
  });

  test("missing or invalid amount is rejected", async () => {
    const malformed = JSON.stringify({
      target: "provider-a",
      amount: "247",
      currency: "USD",
      risk: "low",
      reason: "bad type",
    });
    await expect(client(malformed).proposePurchase(request)).rejects.toThrow("finite positive number");
  });

  test("provider HTTP error is rejected", async () => {
    await expect(client("provider unavailable", 503).proposePurchase(request)).rejects.toThrow("HTTP 503");
  });

  test("model can propose over budget but deterministic ReceiptGate blocks it", async () => {
    const overBudget = JSON.stringify({
      target: "provider-expensive",
      amount: 301,
      currency: "USD",
      risk: "low",
      reason: "model ignored budget",
    });
    const candidate = await client(overBudget).proposePurchase(request);
    const nowMs = 1_800_000_000_000;
    let calls = 0;

    const receipt = await executeWithReceipt({
      candidate,
      proof: makeFixtureProof(candidate, nowMs),
      verifier: fixtureVerifier,
      policy: { maxAmount: request.maxBudget, allowedKinds: ["purchase"] },
      nowMs,
      execute: async () => { calls += 1; },
    });

    expect(candidate.amount).toBe(301);
    expect(receipt.policy.allowed).toBe(false);
    expect(receipt.execution.status).toBe("blocked");
    expect(calls).toBe(0);
  });
});
