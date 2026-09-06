# Hackathon v1 Plan

Authority: **N-class**. This is sequencing and risk inventory, not product proof.

## Winning demo sentence

**No proof, no action.** ReceiptGate blocks an autonomous side effect when the proof chain is invalid or the approved output is tampered with.

## Delivery order

### Atom 001 — core gate + cloud witness

Prove on GitHub-hosted Bun runtime that `execute()` is unreachable on:

- invalid proof;
- proof/candidate mismatch;
- verifier error/unavailability;
- policy denial.

Success evidence: `bun run acceptance` and uploaded GitHub Actions runtime receipt.

### Atom 002 — real 0G proof adapter

Use official 0G Agentic ID / X-Agent-Proof verification to produce the core `VerificationResult`.

Physical target:

```text
real signed /api/* response
 -> capture proof
 -> verify through official 0G path
 -> ReceiptGate PASS
```

Planted negative: mutate the response/candidate binding or proof envelope and observe BLOCK with side-effect count zero.

### Atom 003 — 0G Compute decision

Route one bounded procurement/risk decision through 0G Compute. Preserve provider evidence separately from Agentic ID proof claims.

### Atom 004 — judge-facing demo UI

One screen only:

1. candidate action;
2. proof checks;
3. deterministic policy checks;
4. EXECUTED/BLOCKED;
5. `Tamper` control.

### Atom 005 — optional second agent

Only after the single-agent path is stable. Add planner + risk-agent proof chain for the multi-agent bonus. Do not introduce a generic orchestration framework.

## Demo target

Normal path:

```text
purchase candidate $247
 -> verified agent output
 -> maxAmount <= $300
 -> ReceiptGate PASS
 -> mock side effect executes once
```

Attack path:

```text
approved candidate $247
 -> tamper to $2,470 or invalidate response binding
 -> proof verification FAIL
 -> ReceiptGate BLOCK
 -> side effect executes zero times
```

## Commercial wedge

First buyers/users to test after the Hackathon:

- agentic procurement;
- payment authorization middleware;
- MCP tools with irreversible side effects;
- GitHub merge/deploy gates;
- enterprise agent audit and policy gateways.

Commercial hypothesis: charge per protected action / verified receipt, with enterprise policy, retention, SIEM export, and private deployment later.

## Kill conditions

Do not spend Hackathon time on an idea if any of these remains true after a bounded probe:

- the demo needs a human to assert that the proof is valid;
- the side-effect path can bypass `core/gate.ts`;
- the only evidence is a screenshot/log sentence;
- 0G integration cannot produce a real verifier result;
- UI work delays the planted-negative demo.

## Current non-claims

Atom 001 alone does not prove 0G TEE execution, Agentic ID authenticity, chain state, payments, or production security. It proves the core fail-closed execution shape only.
