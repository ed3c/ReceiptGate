# AGENTS.md

`ReceiptGate` is a proof-gated execution boundary for autonomous agents. Its job is narrow: an external side effect MUST NOT execute unless the exact candidate action has passed proof verification and deterministic policy evaluation.

## Golden Path

1. Read the exact GitHub Issue.
2. Read this file. Do not recursively browse documentation.
3. Read `contracts/system-v1.md` only for system-level claim boundaries, trust topology, or architecture decisions.
4. Follow the Issue to the nearest executable contract/test and inspect only the implementation it names.
5. Implement the smallest independently useful atom.
6. Run `bun run acceptance` before claiming completion.
7. Let GitHub Actions rerun the same acceptance path on the exact commit and publish the runtime receipt.
8. A side-effect path is shippable only when its executable gate is green; prose, prompts, screenshots, model consensus, and README claims are never gate authority.

Repository-owned context has at most three required nodes:

`AGENTS.md -> contracts/system-v1.md (only when needed) -> exact Issue + nearest executable contract/test`

Plans and prompts under `docs/` are optional working material. They are never a fourth required hop.

## Sealed DSH handoff (2026-09-10)

Keep the same three-hop route: this file → `contracts/system-v1.md` §12 → the exact task/Issue and its executable owners below. Do not add a mandatory documentation hop.

- Runtime choice: DSH + OpenRouter; retain Agentic ID sealed sandbox. Do not restore OpenClaw, Hermes, or Private Computer / 0G Compute as prerequisites.
- Environment/tool-call preflight: `scripts/dsh-runtime.ts`, `tests/dsh-runtime.test.ts`.
- Local provisioning: `scripts/provision-agentic-id.ts`.
- Candidate-bound proof and execution gate: `api/live/multi-agent.ts`, `tests/0g-router-serveproof.test.ts`.
- Real service positive/negative canary: `scripts/verify-dsh-service.ts`. Fixed candidates do not prove real multi-agent inference or Vercel readiness.
- Optional operating instructions and dated observations: `docs/0g-router-serveproof-runbook.md` (retained filename; current content is DSH/OpenRouter).

Never inspect or print `.env` contents or credentials. Runtime loading of local `.env` and use of named environment variables is authorized; wallet secrets remain local. The Python Keychain success is machine-specific, not permission to grant every application access. Ask before changing Keychain access controls.

## Agent-friendly shortest path

Make the locally obvious path the globally correct path:

`exact Issue -> nearest contract/test -> smallest implementation -> bun run acceptance -> GitHub Actions receipt`

Do not add a scheduler, generic agent framework, workflow engine, database, blockchain abstraction layer, or policy DSL until a concrete atom requires it.

## Evidence classes

| Class | Meaning | Authority |
| --- | --- | --- |
| P | Probabilistic guidance: prompts, model reasoning, routing suggestions. | May propose; never proves. |
| L | Local deterministic gate: executable test or verifier with positive and planted-negative controls. | May reject/accept a local candidate. |
| R | Provider/runtime readback: GitHub Actions exact-commit result and retained receipt artifact. | May prove the cloud runner exercised the candidate. |
| N | Non-claim: plans, diagrams, inventories, metrics, prose, TODOs. | Describes only. |

Never upgrade P or N into L or R by repetition, review, or model consensus.

## Product invariant

The only high-value invariant for the first product slice is:

```text
execute(sideEffect) is unreachable
unless
verify(proof, candidate) == PASS
AND
policy(candidate) == ALLOW
```

Verification MUST fail closed on malformed, stale, mismatched, or unavailable proof inputs. Policy MUST be deterministic for the same normalized candidate and policy input.

## First delivery boundary

The first vertical slice is intentionally provider-neutral:

- `core/receipt.ts` owns the normalized execution receipt.
- `core/verify.ts` owns proof-verification result normalization.
- `core/policy.ts` owns deterministic allow/deny policy.
- `core/gate.ts` is the only module allowed to call the supplied side-effect callback.
- `adapters/0g/*` will translate real 0G Compute / Agentic ID evidence into the core types; it does not own gate semantics.
- `tests/*` owns executable positive and planted-negative controls.

No UI is required to prove the first invariant.

## Issue atom contract

Every implementation Issue should identify exactly one independently useful atom and include:

```text
<!-- receiptgate-role: repository-mutating-atom -->
<!-- receiptgate-component: core|adapter-0g|demo|ci|docs -->
<!-- receiptgate-runtime: bun-ts|gha-runtime|none -->
<!-- receiptgate-write-boundary: path[, path] -->
<!-- receiptgate-evidence: local-l|github-r -->
```

An Issue body may link one N-class plan and one P-class prompt, but completion criteria MUST point to executable acceptance.

## N-class plan / P-class prompt rule

- `docs/plans/*.md`: N-class decomposition, risks, sequencing, non-claims.
- `docs/prompts/*.md`: P-class agent task envelopes.
- Neither directory may define product truth.
- If a sentence matters to correctness, encode it in `contracts/`, a type, a test, or CI.

## No prose migration

A product guarantee enters README/pitch material only after:

1. its claim boundary is explicit;
2. a positive control passes;
3. a planted negative control fails for the intended reason;
4. GitHub Actions reruns the acceptance path on the candidate commit when cloud evidence is claimed.

For 0G-specific claims, use the upstream SDK/runtime as the source of truth and keep the adapter boundary explicit. Do not reimplement cryptography during the hackathon unless the official SDK cannot express the required check.
