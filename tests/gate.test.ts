import { describe, expect, test } from "bun:test";
import { executeWithReceipt } from "../core/gate";
import type { CandidateAction } from "../core/receipt";
import type { ProofVerifier } from "../core/verify";
import { fixtureVerifier, makeFixtureProof } from "./support/fixtureVerifier";

const NOW = 1_800_000_000_000;

function purchase(amount = 247): CandidateAction {
  return {
    id: "purchase-001",
    kind: "purchase",
    target: "gpu-credits",
    amount,
    currency: "USD",
    payload: { units: 10_000 },
  };
}

describe("ReceiptGate fail-closed execution boundary", () => {
  test("valid proof + allowed policy executes exactly once", async () => {
    const candidate = purchase();
    let calls = 0;

    const receipt = await executeWithReceipt({
      candidate,
      proof: makeFixtureProof(candidate, NOW),
      verifier: fixtureVerifier,
      policy: { maxAmount: 300, allowedKinds: ["purchase"] },
      nowMs: NOW,
      execute: async () => {
        calls += 1;
      },
    });

    expect(calls).toBe(1);
    expect(receipt.verification.ok).toBe(true);
    expect(receipt.policy.allowed).toBe(true);
    expect(receipt.execution).toEqual({ attempted: true, status: "executed" });
  });

  test("invalid proof blocks and executes zero times", async () => {
    const candidate = purchase();
    let calls = 0;

    const receipt = await executeWithReceipt({
      candidate,
      proof: makeFixtureProof(candidate, NOW, { opaque: { fixtureAuthentic: false } }),
      verifier: fixtureVerifier,
      policy: { maxAmount: 300 },
      nowMs: NOW,
      execute: async () => {
        calls += 1;
      },
    });

    expect(calls).toBe(0);
    expect(receipt.verification.ok).toBe(false);
    expect(receipt.execution.attempted).toBe(false);
    expect(receipt.execution.status).toBe("blocked");
  });

  test("tampering the candidate after proof creation blocks execution", async () => {
    const approved = purchase(247);
    const proof = makeFixtureProof(approved, NOW);
    const tampered = purchase(2_470);
    let calls = 0;

    const receipt = await executeWithReceipt({
      candidate: tampered,
      proof,
      verifier: fixtureVerifier,
      policy: { maxAmount: 3_000 },
      nowMs: NOW,
      execute: async () => {
        calls += 1;
      },
    });

    expect(calls).toBe(0);
    expect(receipt.verification.checks.candidateBinding).toBe(false);
    expect(receipt.execution.status).toBe("blocked");
  });

  test("verifier exception fails closed and executes zero times", async () => {
    const candidate = purchase();
    let calls = 0;
    const unavailableVerifier: ProofVerifier = {
      async verify() {
        throw new Error("provider offline");
      },
    };

    const receipt = await executeWithReceipt({
      candidate,
      proof: makeFixtureProof(candidate, NOW),
      verifier: unavailableVerifier,
      policy: { maxAmount: 300 },
      nowMs: NOW,
      execute: async () => {
        calls += 1;
      },
    });

    expect(calls).toBe(0);
    expect(receipt.verification.ok).toBe(false);
    expect(receipt.verification.reasons[0]).toContain("provider offline");
    expect(receipt.execution.status).toBe("blocked");
  });

  test("policy denial blocks and executes zero times", async () => {
    const candidate = purchase(301);
    let calls = 0;

    const receipt = await executeWithReceipt({
      candidate,
      proof: makeFixtureProof(candidate, NOW),
      verifier: fixtureVerifier,
      policy: { maxAmount: 300 },
      nowMs: NOW,
      execute: async () => {
        calls += 1;
      },
    });

    expect(calls).toBe(0);
    expect(receipt.verification.ok).toBe(true);
    expect(receipt.policy.allowed).toBe(false);
    expect(receipt.execution.status).toBe("blocked");
  });
});
