# ReceiptGate System Contract v1

Status: product contract. This file defines claim boundaries; executable tests and runtime readback provide evidence.

## 1. Product outcome

ReceiptGate turns verifiable agent evidence into permission to perform an external side effect.

The v1 invariant is intentionally small:

```text
sideEffect(candidate) MAY be attempted
IFF
proofVerifier(proof, candidate) == PASS
AND
policy(candidate) == ALLOW
```

The implementation MUST fail closed. Missing proof, malformed proof, proof/candidate mismatch, expired proof, verifier failure, or policy denial MUST leave the side-effect callback unreachable.

## 2. Trust topology

```text
agent/provider evidence
        |
        v
ProofVerifier adapter  ---- provider-specific trust ----
        |
        v
normalized VerificationResult
        |
        +----> deterministic Policy
        |             |
        |             v
        +-------> ReceiptGate
                       |
                 PASS  |  FAIL
                       |
                 execute() / blocked
```

The core does not decide whether 0G, another TEE provider, or a local test fixture is trustworthy. A provider adapter owns that translation. The core owns only fail-closed consumption of the normalized result.

## 3. Durable owners

| Durable value | Single owner |
| --- | --- |
| candidate canonicalization/hash | `core/hash.ts` |
| proof verifier interface/result | `core/verify.ts` |
| deterministic policy decision | `core/policy.ts` |
| side-effect reachability | `core/gate.ts` |
| execution receipt schema | `core/receipt.ts` |
| positive/negative oracle | `tests/gate.test.ts` |
| cloud runtime witness | `.github/workflows/acceptance.yml` |

No adapter may call the side effect directly.

## 4. Candidate binding

A verifier receives both the proof and the exact normalized candidate. A PASS means the adapter has established whatever provider-specific binding it claims between those two values. ReceiptGate never infers binding from an agent name, model output, screenshot, text explanation, or reputation score.

For test fixtures, `candidateHash` is a SHA-256 hash over canonical candidate JSON. That fixture proves ReceiptGate wiring and tamper blocking only; it is not a substitute for a 0G signature or TEE attestation.

## 5. Policy

Policy evaluation is deterministic and has no network access. v1 supports a small explicit policy object rather than a policy DSL. The same candidate + policy input MUST produce the same decision.

The first policy surface supports:

- maximum amount;
- optional allowed action kinds.

Unknown/invalid numeric values deny.

## 6. Receipt

Every gate call returns an `ExecutionReceipt` containing:

- candidate id/hash;
- normalized verification result;
- normalized policy decision;
- whether execution was attempted;
- final status (`blocked`, `executed`, or `execution_failed`).

A receipt records what ReceiptGate observed. It is not itself a provider attestation.

## 7. 0G adapter boundary

The next atom will translate the official 0G Agentic ID / `X-Agent-Proof` verification result into `VerificationResult`. The adapter must use the official SDK/runtime verification path when available and must not reimplement cryptography merely for demo aesthetics.

A future 0G-backed PASS may claim only what the exercised 0G verifier actually proves. Compute verification, Agentic ID identity/state binding, response-body binding, and TEE execution are separate claims unless one exercised upstream primitive explicitly joins them.

## 8. Evidence tiers

- P: prompts/reasoning may guide work.
- N: plan/README/diagram may describe work.
- L: `bun run acceptance` plus planted negatives proves core behavior in that runtime.
- R: GitHub Actions executing the exact commit and retaining `runtime-receipt.json` proves the cloud runner exercised that candidate.

A green GitHub workflow does not prove real 0G verification until the 0G adapter atom runs real provider evidence.

## 9. Non-goals for Hackathon slice 1

Do not add before a concrete atom needs them:

- database;
- generalized workflow engine;
- multi-chain abstraction;
- payment settlement;
- policy DSL;
- generic MCP proxy;
- agent scheduler;
- custom cryptographic primitives;
- production authentication/authorization UI.

## 10. Acceptance

The nearest executable contract is `tests/gate.test.ts`.

Required command:

```bash
bun run acceptance
```

Required planted negatives prove that invalid proof, candidate tampering, verifier outage, and policy denial all keep the side-effect callback at call count zero.
