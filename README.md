# ReceiptGate

**Cryptographic receipts before autonomous agents act.**

ReceiptGate is a proof-gated execution boundary: a high-impact side effect is unreachable unless the exact candidate action passes proof verification and deterministic policy.

```text
0G Compute / other candidate source
          |
          v
    CandidateAction
          |
          +----------------------+
                                 |
Agent / provider evidence        |
          |                      |
          v                      |
     ProofVerifier               |
          |                      |
          +-------> Policy <-----+
                       |
                       v
                  ReceiptGate
                  /        \
               PASS        FAIL
                |            |
            execute()       BLOCK
```

## Physical evidence already landed

The exact-head GitHub Actions path proves the fail-closed core on Bun:

- valid proof + allowed policy -> execute exactly once;
- invalid proof -> zero executions;
- candidate tamper after proof -> zero executions;
- verifier outage -> zero executions;
- policy denial -> zero executions.

Run the zero-dependency core path:

```bash
bun run acceptance
```

## 0G Compute candidate adapter

0G Compute is intentionally a **candidate source, not authorization authority**.

`adapters/0g/compute/client.ts` calls a provisioned OpenAI-compatible 0G endpoint and accepts only strict JSON with the exact candidate fields. Prose, code fences, unexpected fields, invalid numbers, currency mismatch, and provider HTTP failures are rejected.

A model is still allowed to propose an amount above budget. The deterministic ReceiptGate policy owns that decision and blocks it. The planted control verifies `$301 > $300` leaves side-effect count at zero.

```text
0G Compute
    |
strict JSON
    |
CandidateAction ($301 is still a valid proposal)
    |
ReceiptGate policy: max $300
    |
   BLOCK
```

### Fast live runtime path

Provision once using the official 0G Compute CLI, then keep wallet material out of inference runtime:

```bash
0g-compute-cli setup-network
0g-compute-cli login
0g-compute-cli deposit --amount 3
0g-compute-cli inference list-providers
0g-compute-cli transfer-fund --provider <PROVIDER> --amount 1
0g-compute-cli inference acknowledge-provider --provider <PROVIDER>
0g-compute-cli inference get-secret --provider <PROVIDER>
```

Store only the generated `app-sk-*` value as the GitHub secret `ZG_API_SECRET`. The manual `0g-compute-live` workflow accepts the non-secret service URL and model id and performs one bounded live inference.

Its receipt is deliberately labeled:

```text
proofBoundary = none-live-compute-only
```

A live Compute response is **not** an Agentic ID ServeProof.

## 0G Agentic ID adapter

ReceiptGate joins two proof facts:

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

Run all current 0G adapter controls:

```bash
bun install
bun run test:0g
bun run probe:0g-sdk
```

### Live Agentic ID canary

`0g-live-proof` is manual because provider availability is external. It can accept an explicit newly provisioned Agent URL, or fall back to public deployment discovery.

The first physical public probe observed 32 models and 78 deployments, but no `running` deployment produced a valid signed `/hello`; the workflow remained RED and retained that availability receipt. Issue #7 stays open until a real ServeProof passes.

## Agent context route

```text
AGENTS.md
  -> contracts/system-v1.md (system decisions only)
  -> exact Issue + nearest executable test
```

`docs/plans/` is N-class planning. `docs/prompts/` is P-class guidance. Neither is correctness authority.

## Hackathon demo target

```text
0G Compute proposes $247 purchase
 -> Agentic ID signed service binds the candidate
 -> official proof + transcript binding PASS
 -> policy <= $300 PASS
 -> EXECUTED

Tamper signed response / candidate
 -> transcript or candidate binding FAIL
 -> BLOCKED

or

0G Compute proposes $301
 -> proof may still PASS
 -> deterministic budget policy FAIL
 -> BLOCKED
```

Shortest remaining path: provision one running 0G Agent + one live Compute API secret -> pass both manual canaries -> build one-screen Tamper demo -> optional second Agent.
