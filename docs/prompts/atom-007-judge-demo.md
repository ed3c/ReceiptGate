# P-class prompt — Atom 007 judge demo

Build one judge-facing page around existing ReceiptGate invariants. The UI is not evidence authority.

Required behavior:

- normal fixture path shows `$247`, proof PASS, deterministic policy PASS, `EXECUTED` and exactly one mock side-effect call;
- tamper path reuses the proof made for `$247`, displays `$2,470`, fails candidate binding before policy and shows `ACTION BLOCKED` with zero side-effect calls;
- fixture proof must be labeled non-0G;
- live Compute and live Agentic ID are separate additive panels with explicit proof boundaries;
- errors and provider outages may make live panels unavailable but must never weaken core behavior;
- no browser response, server log or artifact may contain a secret.

The GitHub Actions oracle must launch the real HTTP server and exercise both fixture routes over HTTP.
