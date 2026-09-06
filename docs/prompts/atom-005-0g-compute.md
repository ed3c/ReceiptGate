# Agent Prompt — Atom 005 0G Compute Candidate

Authority: **P-class**. Completion belongs to Issue #10 and `tests/0g-compute.test.ts`.

Read `AGENTS.md`, then `contracts/system-v1.md` only for the existing proof/gate claim boundary, then Issue #10 and the nearest oracle. Stop traversal there.

Goal: turn one 0G Compute OpenAI-compatible completion into a structurally valid `CandidateAction` without letting probabilistic model output become policy authority.

Rules:

- direct API runtime uses provisioned `ZG_SERVICE_URL` + `ZG_API_SECRET` + model;
- no private key in the inference workflow;
- require strict JSON only; reject prose/code fences/extra fields/type mismatches;
- model may propose any positive amount; deterministic `core/policy.ts` remains the budget authority and must block an over-budget candidate;
- no side effect is real in this atom; the live canary uses the existing fixture proof solely to exercise Compute -> gate wiring;
- label that fixture proof explicitly as not Agentic ID evidence;
- do not merge #7's live Agentic ID claim with successful 0G Compute inference.

Do not add retry frameworks, model routers, databases, wallet brokers, or autonomous payment execution.
