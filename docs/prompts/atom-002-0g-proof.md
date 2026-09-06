# Agent Prompt — Atom 002 0G Proof Binding

Authority: **P-class**. Completion belongs to Issue #3 and `tests/0g-verifier.test.ts`.

Read `AGENTS.md`, then `contracts/system-v1.md`, then Issue #3 and the nearest oracle. Stop document traversal there.

Implement the 0G provider boundary without moving provider semantics into `core/`.

Required reasoning split:

1. official Agentic ID SDK `verifyProof` owns signer/on-chain data/deadline checks;
2. ReceiptGate's 0G adapter recomputes the sealed proxy's published `taskHash` formula over the exact HTTP transcript;
3. the action candidate must be deterministically extracted from the taskHash-covered response body;
4. a separate unsigned `candidateHash` is not proof of response integrity;
5. any exception or mismatch returns failure to core, which already fails closed.

Do not claim that this unit atom exercised a real Agentic ID or TEE. That requires the live probe atom.

Cloud acceptance for this atom is path-scoped and may install the exact official SDK package; do not slow the zero-install core acceptance job.
