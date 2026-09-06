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

## Physical evidence already landed

Atom #1 is cloud-proven on GitHub-hosted Bun. `tests/gate.test.ts` proves:

- valid proof + allowed policy -> execute exactly once;
- invalid proof -> zero executions;
- candidate tamper after proof -> zero executions;
- verifier outage -> zero executions;
- policy denial -> zero executions.

Run the zero-dependency core path:

```bash
bun run acceptance
```

## 0G Agentic ID adapter

Atom #3 joins the two proof facts that the product actually needs:

1. official `@0gfoundation/0g-agenticid-sdk` `verifyProof()` for signer identity, expiry, and on-chain data roots;
2. recomputed 0G sealed-proxy `taskHash` for exact request/response transcript integrity.

The gate candidate is extracted from the taskHash-covered response body. ReceiptGate does not trust a separate unsigned candidate hash.

```text
X-Agent-Proof / ServeProof
        |
        +--> official SDK verifyProof ---- signer / deadline / data roots
        |
HTTP transcript
        +--> recompute taskHash ---------- request / response bytes
        |
response body
        +--> extract candidate ----------- exact action to authorize
                         |
                         v
                    ReceiptGate
```

Install and run the adapter oracle:

```bash
bun install
bun run test:0g
bun run probe:0g-sdk
```

### Claim boundary

The adapter unit oracle mocks the official SDK result to prove composition and tamper blocking. Its path-scoped GitHub Action also proves that the pinned official SDK imports successfully on the cloud runner. A **live 0G provider probe is still required** before claiming a real Agentic ID/agentSeal/chain/TEE verification.

## Agent context route

```text
AGENTS.md
  -> contracts/system-v1.md (system decisions only)
  -> exact Issue + nearest executable test
```

`docs/plans/` is N-class planning. `docs/prompts/` is P-class guidance. Neither is correctness authority.

## Hackathon demo target

```text
$247 autonomous purchase
 -> 0G proof PASS
 -> policy <= $300 PASS
 -> EXECUTED

Tamper signed response / candidate
 -> transcript or candidate binding FAIL
 -> BLOCKED
```

Shortest remaining path: live 0G proof -> 0G Compute decision -> one-screen Tamper demo -> optional second agent.
