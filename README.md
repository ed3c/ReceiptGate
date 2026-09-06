# ReceiptGate

**Cryptographic receipts before autonomous agents act.**

ReceiptGate is a proof-gated execution boundary: a high-impact side effect is unreachable unless the exact candidate action passes proof verification and deterministic policy.

```text
Agent / provider evidence
          |
          v
     ProofVerifier
          |
          v
        Policy
          |
          v
      ReceiptGate
      /        \
   PASS        FAIL
    |            |
 execute()     BLOCK
```

## Why this shape

Agent systems increasingly call tools that spend money, mutate infrastructure, merge code, deploy software, or modify customer data. ReceiptGate does not ask another model whether an action "looks safe". It creates one mechanical boundary before the side effect.

## Current physical evidence

Atom #1 exercises five controls in `tests/gate.test.ts`:

- valid proof + allowed policy -> execute exactly once;
- invalid proof -> zero executions;
- candidate tamper after proof -> zero executions;
- verifier outage -> zero executions;
- policy denial -> zero executions.

Run:

```bash
bun run acceptance
```

GitHub Actions runs the same path and retains `artifacts/runtime-receipt.json` for the exact commit.

## Important claim boundary

The current fixture verifier is deliberately named `fixture-only-not-0g`. It proves the ReceiptGate wiring and fail-closed behavior; it **does not** prove a real 0G signature, TEE execution, chain state, or Agentic ID identity.

The next atom replaces that fixture boundary with an adapter that consumes the official 0G Agentic ID / `X-Agent-Proof` verification path.

## Agent context route

Repository context is limited to three required nodes:

```text
AGENTS.md
  -> contracts/system-v1.md (system decisions only)
  -> exact Issue + nearest executable test
```

`docs/plans/` is N-class planning. `docs/prompts/` is P-class guidance. Neither is correctness authority.

## Hackathon demo target

```text
$247 autonomous purchase
 -> proof PASS
 -> policy <= $300 PASS
 -> EXECUTED

Tamper $247 -> $2,470
 -> proof/candidate binding FAIL
 -> BLOCKED
```

After the core boundary is cloud-proven, the shortest path is real 0G proof -> 0G Compute decision -> one-screen Tamper demo -> optional second agent.
