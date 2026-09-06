import { describe, expect, test } from "bun:test";
import { runVercelFixtureScenario } from "../api/demo";
import { runFixtureScenario } from "../demo/fixture";

async function assertParity(tamper: boolean) {
  const production = await runVercelFixtureScenario(tamper, 1_800_000_000_000);
  const core = await runFixtureScenario(tamper);

  expect(production.candidate).toEqual(core.candidate);
  expect(production.receipt.candidateId).toBe(core.receipt.candidateId);
  expect(production.receipt.candidateHash).toBe(core.receipt.candidateHash);
  expect(production.receipt.verification.ok).toBe(core.receipt.verification.ok);
  expect(production.receipt.verification.checks).toEqual(core.receipt.verification.checks);
  expect(production.receipt.verification.reasons).toEqual(core.receipt.verification.reasons);
  expect(production.receipt.policy).toEqual(core.receipt.policy);
  expect(production.receipt.execution).toEqual(core.receipt.execution);
  expect(production.sideEffectCalls).toBe(core.sideEffectCalls);
}

describe("Vercel self-contained demo adapter", () => {
  test("normal scenario remains semantically identical to the core gate", async () => {
    await assertParity(false);
  });

  test("tamper scenario remains semantically identical to the core gate", async () => {
    await assertParity(true);
  });
});
