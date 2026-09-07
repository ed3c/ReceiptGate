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
  RECEIPTGATE_AGENT_ID: process.env.RECEIPTGATE_AGENT_ID,
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

  test("recognizes only exact HTTPS Router endpoints across every Compute surface", async () => {
    const { routerNetwork } = await import("../adapters/0g/compute/transport");
    const { classifyComputeTransport: capabilityTransport } = await import("../api/live/capability");
    const config = (await import("../api/config")).default;
    const base = "https://router-api-testnet.integratenetwork.work/v1";
    expect(routerNetwork(base)).toBe("testnet");
    expect(routerNetwork("https://router-api.0g.ai/v1")).toBe("mainnet");
    expect(singleChatUrl(base)).toBe(`${base}/chat/completions`);
    expect(multiChatUrl(base)).toBe(`${base}/chat/completions`);
    for (const classify of [singleTransport, multiTransport, capabilityTransport]) {
      expect(classify(base)).toBe("0g-router");
      for (const invalid of [base.replace("https:", "http:"), base.replace(".work", ".work.attacker.example"), base.replace("/v1", "/untrusted"), base + "?redirect=evil", base.replace("https://", "https://user@"), "not a URL"]) {
        expect(classify(invalid)).toBe("0g-compute-provider");
        expect(routerNetwork(invalid)).toBeNull();
      }
    }
    process.env.ZG_SERVICE_URL = base;
    process.env.ZG_MODEL = "qwen2.5-omni";
    process.env.ZG_API_SECRET = "sk-test-secret-never-return";
    const body = await (await config.fetch()).json();
    expect(body.computeNetwork).toBe("testnet");
    expect(body.computeTransport).toBe("0g-router");
    expect(JSON.stringify(body)).not.toContain(process.env.ZG_API_SECRET);
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
    process.env.RECEIPTGATE_AGENT_ID = "393";
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

describe("ServeProof is always an execution precondition", () => {
  test("missing ServeProof blocks even when caller marks it optional", async () => {
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
    expect(gated.policy.allowed).toBe(false);
    expect(gated.execution.status).toBe("blocked");
    expect(gated.execution.sideEffectCalls).toBe(0);
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

describe("explicit procurement total price", () => {
  test("separates total USD price from credit quantity without rewriting model values", async () => {
    const { parseProcurement } = await import("../api/live/multi-agent");
    for (const totalPriceUsd of [247, 301, 10_000]) {
      const parsed = parseProcurement(JSON.stringify({ target: "GPU inference credits", totalPriceUsd, currency: "USD", risk: "low", reason: "proposal" }));
      expect(parsed.amount).toBe(totalPriceUsd);
    }
    for (const totalPriceUsd of ["247", null, 0, -1]) {
      expect(() => parseProcurement(JSON.stringify({ target: "GPU inference credits", totalPriceUsd, currency: "USD", risk: "low", reason: "proposal" }))).toThrow("totalPriceUsd must be a finite positive number");
    }
    expect(() => parseProcurement('{"target":"credits","amount":247,"currency":"USD","risk":"low","reason":"old ambiguous schema"}')).toThrow("must contain exactly");
  });

  test("normal, over-budget, confused quantity, and tampered totals still traverse the same gate", async () => {
    const { default: handler } = await import("../api/live/multi-agent");
    const previousFetch = globalThis.fetch;
    const previousAllowlist = process.env.DEMO_ALLOWED_WALLETS;
    try {
      delete process.env.DEMO_ALLOWED_WALLETS;
      delete process.env.RECEIPTGATE_AGENT_URL;
      delete process.env.RECEIPTGATE_AGENT_SERVICE_PATH;
      process.env.ZG_SERVICE_URL = "https://router-api-testnet.integratenetwork.work/v1";
      process.env.ZG_MODEL = "qwen2.5-omni";
      process.env.ZG_API_SECRET = "sk-test";
      for (const { total, tamper, allowed } of [
        { total: 247, tamper: false, allowed: true },
        { total: 301, tamper: false, allowed: false },
        { total: 10_000, tamper: false, allowed: false },
        { total: 247, tamper: true, allowed: false },
      ]) {
        let calls = 0;
        globalThis.fetch = (async (url: any, options: any) => {
          if (String(url).endsWith('/api/wallet/verify')) return Response.json({ ok: true, address: "0x" + "1".repeat(40), checks: { signature: true } });
          expect(String(url)).toBe("https://router-api-testnet.integratenetwork.work/v1/chat/completions");
          const input = JSON.parse(options.body);
          const user = JSON.parse(input.messages[1].content);
          calls++;
          if (calls === 1) {
            expect(user.quote).toEqual({ totalPriceUsd: 247, currency: "USD" });
            expect(user.quantity).toEqual({ value: 10000, unit: "credits" });
            expect(input.messages[0].content).toContain("totalPriceUsd");
            return Response.json({ choices: [{ message: { content: JSON.stringify({ target: "GPU inference credits", totalPriceUsd: total, currency: "USD", risk: "low", reason: "proposal" }) } }] });
          }
          expect(user.candidate.amount).toBe(tamper ? total * 10 : total);
          // Even a maliciously permissive review cannot bypass the deterministic gate.
          return Response.json({ choices: [{ message: { content: JSON.stringify({ candidateHash: user.candidateHash, verdict: "ALLOW", risk: "low", reason: "advisory only" }) } }] });
        }) as typeof fetch;
        const response = await handler.fetch(new Request("https://receiptgate.example/api/live/multi-agent", { method: "POST", body: JSON.stringify({ address: "0x" + "1".repeat(40), message: "mock authorization", signature: "mock", tamper }) }));
        const body = await response.json();
        expect(response.status).toBe(200);
        expect(calls).toBe(2);
        expect(body.agentA.candidate.amount).toBe(total);
        const proposal = evaluateHandoff({ candidate: body.handoffInput.candidate, originalHash: body.agentA.candidateHash, transmittedHash: body.handoffInput.candidateHash, review: body.agentB.review });
        expect(proposal.policy.allowed).toBe(allowed);
        expect(body.policy.allowed).toBe(false);
        expect(body.sideEffectCalls).toBe(0);
        expect(body.execution.status).toBe("blocked");
        expect(body.live).toBe(false);
        expect(body.fullPathLive).toBe(false);
        expect(body.serveProof.required).toBe(true);
        if (tamper) expect(body.handoff.bound).toBe(false);
        if (total > 300) expect(body.policy.reasons).toContain(`candidate amount ${total} exceeds max 300`);
      }
    } finally {
      globalThis.fetch = previousFetch;
      if (previousAllowlist == null) delete process.env.DEMO_ALLOWED_WALLETS;
      else process.env.DEMO_ALLOWED_WALLETS = previousAllowlist;
    }
  });
});


test("valid candidate echo cannot reuse a ServeProof from different transcript bytes", async () => {
  const { matchesServeProofTranscript } = await import("../api/live/multi-agent");
  const { computeZeroGTaskHash } = await import("../adapters/0g/taskHash");
  const transcript = { method: "POST", requestUri: "/api/receiptgate", requestBody: '{"candidate":{"amount":247}}', responseBody: '{"candidateHash":"echo"}', statusCode: 200 };
  const taskHash = computeZeroGTaskHash(transcript);
  expect(matchesServeProofTranscript(taskHash, transcript)).toBe(true);
  for (const mutation of [
    { requestBody: '{"candidate":{"amount":2470}}' },
    { responseBody: '{"candidateHash":"forged echo"}' },
    { requestUri: "/api/another-service" }, { method: "GET" }, { statusCode: 500 },
  ]) {
    expect(matchesServeProofTranscript(taskHash, { ...transcript, ...mutation })).toBe(false);
  }
  expect(matchesServeProofTranscript(null, transcript)).toBe(false);
});

test("mandatory execution counts a real callback only after proof, identity, transcript, handoff and policy pass", async () => {
  const { verifyCandidateServeProof, executeVerifiedHandoff } = await import("../api/live/multi-agent");
  const { computeZeroGTaskHash } = await import("../adapters/0g/taskHash");
  const candidate = { id: "signed", kind: "purchase" as const, target: "credits", amount: 247, currency: "USD" as const,
    payload: { product: "GPU inference credits", units: 10000, quotedPrice: 247, sourceRisk: "low" as const, sourceReason: "quote", computeModel: "test" } };
  const hash = await candidateHash(candidate);
  const base = evaluateHandoff({ candidate, originalHash: hash, transmittedHash: hash,
    review: { candidateHash: hash, verdict: "ALLOW", risk: "low", reason: "ok" } });
  process.env.RECEIPTGATE_AGENT_URL = "https://agent.example";
  process.env.RECEIPTGATE_AGENT_SERVICE_PATH = "/api/receiptgate";
  process.env.RECEIPTGATE_AGENT_ID = "393";
  let scenario = "valid";
  let sdkCalls = 0;
  const connect = async (): Promise<any> => ({
    agent: { connect: async () => ({ base: "https://agent.example", fetchWithProof: async (path: string, init: RequestInit) => {
      if (scenario === "unavailable") throw new Error("service unavailable");
      const responseBody = JSON.stringify({ accepted: scenario !== "rejected", service: "receiptgate-candidate-binding-v1", candidateHash: scenario === "candidate" ? "0xwrong" : hash });
      const taskHash = computeZeroGTaskHash({ method: "POST", requestUri: path, requestBody: String(init.body), responseBody, statusCode: 200 });
      return { response: new Response(responseBody), proof: scenario === "missing" ? null : {
        agentId: scenario === "identity" ? 394n : 393n,
        taskHash: scenario === "transcript" ? "0x" + "00".repeat(32) : taskHash,
        signature: "fixture", dataHashes: [],
      } };
    } }) },
    reputation: { verifyProof: async () => {
      sdkCalls++;
      if (scenario === "verifier-error") throw new Error("RPC unavailable");
      return { ok: !["expired", "signature"].includes(scenario), signerMatches: scenario !== "signature", notExpired: scenario !== "expired", dataOnChain: true, reasons: [scenario] };
    } },
  });
  for (scenario of ["valid", "missing", "unavailable", "rejected", "candidate", "identity", "transcript", "expired", "signature", "verifier-error"]) {
    const proof = await verifyCandidateServeProof(candidate, hash, connect);
    const result = await executeVerifiedHandoff(candidate, base, proof);
    expect(result.execution.sideEffectCalls).toBe(scenario === "valid" ? 1 : 0);
    expect(result.receipt.execution.attempted).toBe(scenario === "valid");
    expect(result.execution.status).toBe(scenario === "valid" ? "executed" : "blocked");
  }
  scenario = "valid";
  const proof = await verifyCandidateServeProof(candidate, hash, connect);
  const tampered = evaluateHandoff({ candidate, originalHash: "0x" + "00".repeat(32), transmittedHash: hash,
    review: { candidateHash: hash, verdict: "ALLOW", risk: "low", reason: "ok" } });
  expect((await executeVerifiedHandoff(candidate, tampered, proof)).execution.sideEffectCalls).toBe(0);
  for (const key of ["RECEIPTGATE_AGENT_URL", "RECEIPTGATE_AGENT_SERVICE_PATH", "RECEIPTGATE_AGENT_ID"]) {
    const saved = process.env[key];
    delete process.env[key];
    const callsBefore = sdkCalls;
    const missing = await verifyCandidateServeProof(candidate, hash, connect);
    expect(missing.required).toBe(true);
    expect(missing.verified).toBe(false);
    expect((await executeVerifiedHandoff(candidate, base, missing)).execution.sideEffectCalls).toBe(0);
    expect(sdkCalls).toBe(callsBefore);
    process.env[key] = saved;
  }
});
