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
| 0G transcript taskHash | `adapters/0g/taskHash.ts` |
| 0G SDK/result composition | `adapters/0g/verifier.ts` |
| core positive/negative oracle | `tests/gate.test.ts` |
| 0G adapter oracle | `tests/0g-verifier.test.ts` |
| cloud runtime witness | `.github/workflows/*.yml` |

No adapter may call the side effect directly.

## 4. Candidate binding

A verifier receives both the proof and the exact normalized candidate. A PASS means the adapter has established whatever provider-specific binding it claims between those two values. ReceiptGate never infers binding from an agent name, model output, screenshot, text explanation, or reputation score.

The fixture verifier uses `candidateHash` only to prove core wiring. The 0G verifier deliberately ignores that generic field: its candidate is extracted from the response body covered by the 0G taskHash, then compared deterministically with the candidate presented to the gate.

## 5. Policy

Policy evaluation is deterministic and has no network access. v1 supports a small explicit policy object rather than a policy DSL. The same candidate + policy input MUST produce the same decision.

The first policy surface supports maximum amount and optional allowed action kinds. Unknown/invalid numeric values deny.

## 6. Receipt

Every gate call returns an `ExecutionReceipt` containing the candidate id/hash, normalized verification result, normalized policy decision, execution-attempt flag, and final status (`blocked`, `executed`, or `execution_failed`).

A ReceiptGate receipt records what ReceiptGate observed. It is not itself a provider attestation.

## 7. 0G Agentic ID proof boundary

0G's official TypeScript SDK exposes `ag.reputation.verifyProof(serveProof)`. The upstream implementation checks:

- proof deadline has not passed;
- signature resolves to the on-chain `agentSeal` for the Agentic ID;
- every declared `dataHash` is present in that Agentic ID's on-chain intelligent data.

That call does **not** receive the HTTP response body, so ReceiptGate must not equate SDK `ok` with response-body integrity.

The sealed 0G proxy publishes the transcript binding separately as `taskHash`:

```text
keccak256(
  method || requestURI ||
  keccak256(requestBody) ||
  keccak256(responseBody) ||
  decimal(statusCode)
)
```

ReceiptGate's 0G PASS therefore requires both:

```text
official verifyProof(serveProof) == PASS
AND
recomputed transcript taskHash == serveProof.taskHash
AND
candidate extracted from that responseBody == gate candidate
```

Signature recovery/on-chain identity verification remains in the official SDK. ReceiptGate mirrors only the published transcript-hash formula needed to join the proof to bytes it is authorizing.

## 8. Evidence tiers

- P: prompts/reasoning may guide work.
- N: plan/README/diagram may describe work.
- L: Bun tests plus planted negatives prove behavior in that runtime.
- R: GitHub Actions executing the exact candidate/ref and retaining a receipt artifact proves the cloud runner exercised it.

Mocked SDK results in the 0G adapter oracle prove composition only. They do not prove a live 0G chain, agentSeal, TEE, or deployed Agentic ID. Those require a separate live provider probe.

## 9. Non-goals before a concrete atom

Do not add a database, generalized workflow engine, multi-chain abstraction, payment settlement, policy DSL, generic MCP proxy, agent scheduler, custom signature implementation, or production auth UI.

## 10. Acceptance

Core oracle:

```bash
bun run acceptance
```

0G adapter oracle (after dependency install):

```bash
bun run test:0g
```

Required planted negatives keep side-effect call count at zero for invalid proof, candidate tampering, verifier outage, and policy denial.
