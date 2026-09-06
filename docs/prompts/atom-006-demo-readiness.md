# P-class prompt — Atom 006 demo readiness

Implement the shortest credential boundary for the Hackathon demo.

Rules:

- Never write, echo, commit, or artifact `PRIVATE_KEY`, `AGENT_API_KEY`, or `ZG_API_SECRET`.
- Private key is a local provisioning input only.
- A successful Agentic ID provision receipt contains public identifiers, URL and verification booleans only.
- Compute provisioning follows the official CLI flow and leaves the generated `app-sk-*` in the local terminal for the operator to place into GitHub secret storage.
- Runtime scripts consume `ZG_API_SECRET`; they never need the wallet private key.
- Do not add secret-manager abstractions, KMS, vaults, databases or wallet custody code for the Hackathon.
