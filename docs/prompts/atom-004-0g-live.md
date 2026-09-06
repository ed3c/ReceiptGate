# Agent Prompt — Atom 004 Live 0G Proof

Authority: **P-class**. Completion belongs to Issue #7 and live GitHub Actions provider readback.

Read `AGENTS.md`, `contracts/system-v1.md`, then Issue #7 and `adapters/0g/live-probe.ts`. Stop traversal there.

Goal: obtain one real, read-only, signed 0G Agentic ID response from GitHub-hosted runtime and prove both halves of the trust boundary:

1. official SDK `verifyProof` passes signer/deadline/on-chain-data checks;
2. ReceiptGate recomputes the upstream taskHash from the exact HTTP transcript and it equals `ServeProof.taskHash`.

Use public discovery only. Do not provide a wallet or private key. Do not deploy, stop, start, reset, submit feedback, pay, or invoke arbitrary agent services. `/hello` is the only permitted agent endpoint for this atom.

Try multiple currently running public deployments because an individual public sandbox may be stale. Bound attempts and request timeout. Store only public proof metadata and aggregate counts in the artifact; do not store response bodies.

Failure is useful evidence. Do not weaken the oracle to green the workflow if no live signed response is available.
