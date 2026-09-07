import { describe, expect, test } from "bun:test";
import { RECEIPTGATE_DEMO_WALLET, formatOg, fundingReadiness } from "../api/wallet/readiness";

describe("single-wallet runtime readiness", () => {
  test("pins the controlled hackathon EOA", () => {
    expect(RECEIPTGATE_DEMO_WALLET).toBe("0x5688FE84cf3f3B7E37e31F6205C619EE06B6925A");
  });

  test("formats exact Galileo native OG without floating point", () => {
    expect(formatOg(10_600_000_000_000_000_000n)).toBe("10.6");
    expect(formatOg(600_000_000_000_000_000n)).toBe("0.6");
    expect(formatOg(10_000_000_000_000_000_000n)).toBe("10");
  });

  test("keeps Router credit separate from native funding thresholds", () => {
    const ready = fundingReadiness(10_600_000_000_000_000_000n);
    expect(ready.agenticIdSandboxTarget.ready).toBe(true);
    expect(ready.legacyComputeFallback.ready).toBe(true);
    expect(ready.hackathonReserve.ready).toBe(true);
    expect(ready.hackathonReserve.semantics).toContain("not the same as Private Computer inference credit");
  });

  test("does not pretend 0.6 OG satisfies the legacy or 10 OG reserve thresholds", () => {
    const ready = fundingReadiness(600_000_000_000_000_000n);
    expect(ready.agenticIdSandboxTarget.ready).toBe(true);
    expect(ready.legacyComputeFallback.ready).toBe(false);
    expect(ready.hackathonReserve.ready).toBe(false);
  });
});
