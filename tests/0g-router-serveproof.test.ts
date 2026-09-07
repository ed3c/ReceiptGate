import { afterEach, describe, expect, test } from "bun:test";
import {
  chatCompletionsUrl as singleChatUrl,
  classifyComputeTransport as singleTransport,
} from "../api/live/compute";
import {
  applyServeProofGate,
  candidateHash,
  chatCompletionsUrl as multiChatUrl,
  classifyComputeTransport as multiTransport,
  evaluateHandoff,
} from "../api/live/multi-agent";

const savedEnv = {
  ZG_SERVICE_URL: process.env.ZG_SERVICE_URL,
  ZG_MODEL: process.env.ZG_MODEL,
  ZG_API_SECRET: process.env.ZG_API_SECRET,
  RECEIPTGATE_AGENT_URL: process.env.RECEIPTGATE_AGENT_URL,
  RECEIPTGATE_AGENT_SERVICE_PATH: process.env.RECEIPTGATE_AGENT_SERVICE_PATH,
};

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("0G OpenAI-compatible runtime transport", () => {
  test("routes official 0G Router /v1 directly to chat/completions", () => {
    const base = "https://router-api.0g.ai/v1";
    expect(singleChatUrl(base)).toBe("https://router-api.0g.ai/v1/chat/completions");
    expect(multiChatUrl(base)).toBe("https://router-api.0g.ai/v1/chat/completions");
    expect(singleTransport(base)).toBe("0g-router");
    expect(multiTransport(base)).toBe("0g-router");
  });

  test("preserves provider app-sk /v1/proxy transport", () => {
    const base = "https://provider.example/v1/proxy";
    expect(singleChatUrl(base)).toBe("https://provider.example/v1/proxy/chat/completions");
    expect(multiChatUrl(base)).toBe("https://provider.example/v1/proxy/chat/completions");
    expect(singleTransport(base)).toBe("0g-compute-provider");
    expect(multiTransport(base)).toBe("0g-compute-provider");
  });

  test("public config recognizes router and candidate ServeProof configuration without exposing secrets", async () => {
    process.env.ZG_SERVICE_URL = "https://router-api.0g.ai/v1";
    process.env.ZG_MODEL = "0gm-1.0-35b-a3b";
    process.env.ZG_API_SECRET = "sk-test-secret-never-return";
    process.env.RECEIPTGATE_AGENT_URL = "https://agent.example";
    process.env.RECEIPTGATE_AGENT_SERVICE_PATH = "/api/receiptgate";

    const config = (await import("../api/config")).default;
    const response = await config.fetch();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(body.computeConfigured).toBe(true);
    expect(body.computeTransport).toBe("0g-router");
    expect(body.computeModel).toBe("0gm-1.0-35b-a3b");
    expect(body.agentConfigured).toBe(true);
    expect(body.serveProofConfigured).toBe(true);
    expect(body.serveProofServicePath).toBe("/api/receiptgate");
    expect(serialized).not.toContain("sk-test-secret-never-return");
  });
});

describe("ServeProof is an execution precondition only when configured", () => {
  test("missing optional ServeProof leaves the existing deterministic gate unchanged", async () => {
    const candidate = {
      id: "test",
      kind: "purchase" as const,
      target: "0G GPU inference credits",
      amount: 247,
      currency: "USD" as const,
      payload: {
        product: "GPU inference credits",
        units: 10_000,
        quotedPrice: 247,
        sourceRisk: "low" as const,
        sourceReason: "within budget",
        computeModel: "0gm-1.0-35b-a3b",
      },
    };
    const hash = await candidateHash(candidate);
    const base = evaluateHandoff({
      originalHash: hash,
      transmittedHash: hash,
      review: { candidateHash: hash, verdict: "ALLOW", risk: "low", reason: "ok" },
      candidate,
    });
    const gated = applyServeProofGate(base, { required: false, verified: false });
    expect(gated.policy.allowed).toBe(true);
    expect(gated.execution.status).toBe("executed");
    expect(gated.execution.sideEffectCalls).toBe(1);
  });

  test("configured but invalid ServeProof makes side effect unreachable", async () => {
    const candidate = {
      id: "test",
      kind: "purchase" as const,
      target: "0G GPU inference credits",
      amount: 247,
      currency: "USD" as const,
      payload: {
        product: "GPU inference credits",
        units: 10_000,
        quotedPrice: 247,
        sourceRisk: "low" as const,
        sourceReason: "within budget",
        computeModel: "0gm-1.0-35b-a3b",
      },
    };
    const hash = await candidateHash(candidate);
    const base = evaluateHandoff({
      originalHash: hash,
      transmittedHash: hash,
      review: { candidateHash: hash, verdict: "ALLOW", risk: "low", reason: "ok" },
      candidate,
    });
    const gated = applyServeProofGate(base, {
      required: true,
      verified: false,
      reason: "signed service response is not bound to the execution candidateHash",
    });
    expect(gated.policy.allowed).toBe(false);
    expect(gated.policy.reasons).toContain("signed service response is not bound to the execution candidateHash");
    expect(gated.execution.status).toBe("blocked");
    expect(gated.execution.sideEffectCalls).toBe(0);
  });

  test("verified candidate-bound ServeProof preserves an otherwise valid execution", async () => {
    const candidate = {
      id: "test",
      kind: "purchase" as const,
      target: "0G GPU inference credits",
      amount: 247,
      currency: "USD" as const,
      payload: {
        product: "GPU inference credits",
        units: 10_000,
        quotedPrice: 247,
        sourceRisk: "low" as const,
        sourceReason: "within budget",
        computeModel: "0gm-1.0-35b-a3b",
      },
    };
    const hash = await candidateHash(candidate);
    const base = evaluateHandoff({
      originalHash: hash,
      transmittedHash: hash,
      review: { candidateHash: hash, verdict: "ALLOW", risk: "low", reason: "ok" },
      candidate,
    });
    const gated = applyServeProofGate(base, { required: true, verified: true });
    expect(gated.policy.allowed).toBe(true);
    expect(gated.execution.status).toBe("executed");
    expect(gated.execution.sideEffectCalls).toBe(1);
  });
});
