# Agent Prompt — Atom 001 Core Gate

Authority: **P-class**. This prompt guides an implementation agent; the Issue and executable tests own completion.

You are implementing `ed3c/ReceiptGate#1`.

Read in this order and stop traversal after the nearest oracle:

1. `AGENTS.md`;
2. `contracts/system-v1.md` because this atom establishes the trust boundary;
3. Issue #1 and `tests/gate.test.ts`.

Goal: implement the smallest Bun+TypeScript core in which the supplied side-effect callback is unreachable unless proof verification passes for the exact candidate and deterministic policy allows it.

Constraints:

- zero runtime dependencies;
- no database;
- no network calls in core;
- no UI;
- no blockchain abstraction;
- verifier failures fail closed;
- adapter semantics do not leak into core;
- fixture proof is clearly named as a test fixture and never described as 0G proof;
- one execution owner: `core/gate.ts`.

Required physical controls are exactly those in Issue #1. Do not replace them with additional prose.

Before completion run:

```bash
bun run acceptance
```

If an invariant is hard to explain, change repository shape or test naming so the correct path is more obvious rather than adding another instruction layer.
