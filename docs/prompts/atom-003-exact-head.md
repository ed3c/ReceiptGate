# Agent Prompt — Atom 003 Exact-Head CI

Authority: **P-class**. Completion belongs to Issue #5 and GitHub Actions readback.

Read `AGENTS.md`, then Issue #5. `contracts/system-v1.md` is not needed unless the evidence classes themselves change.

Goal: make the core acceptance receipt honest about the exact commit exercised on GitHub-hosted runtime.

Required shape:

- PR event -> `pull_request.head.sha`;
- push/workflow_dispatch -> `github.sha`;
- checkout that SHA explicitly;
- assert checked-out HEAD equals the target before tests;
- pass the same target into runtime receipt generation;
- assert the emitted receipt contains the same target SHA;
- artifact name includes the target SHA.

Do not add branch protection, write permissions, merge automation, another test framework, or dependency installation. Preserve the zero-install core acceptance latency.
