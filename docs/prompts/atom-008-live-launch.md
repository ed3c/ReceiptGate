# P-class prompt — Atom 008 live launch

After local provisioning has produced a short-lived 0G Compute `app-sk-*` and a verified running Agentic ID URL, automate every remaining demo step.

Rules:

- never upload or request `PRIVATE_KEY` in GitHub Actions;
- pipe `ZG_API_SECRET` directly from local environment to `gh secret set`; do not echo it or write it to a file;
- workflow inputs are non-secret service URL, model id and Agentic ID URL only;
- live workflow must exercise both real 0G panels plus the normal/tamper gate paths over the actual HTTP server;
- Compute and Agentic ID retain separate proof boundaries; do not imply Compute output itself is an Agentic ID ServeProof;
- retain one exact-head combined live receipt;
- provide one command to delete the temporary GitHub runtime secret after the Hackathon.
