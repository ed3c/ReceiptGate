# ReceiptGate — 0G Router + candidate ServeProof runbook

This is the shortest production path for the Zero Gravity Taipei demo.

## 1. 0G Router runtime

Use the same three ReceiptGate production variables already supported by Vercel:

```text
ZG_SERVICE_URL=https://router-api.0g.ai/v1
ZG_MODEL=0gm-1.0-35b-a3b
ZG_API_SECRET=sk-...
```

Do not commit or print `ZG_API_SECRET`.

Before writing the values to Vercel, run:

```bash
bun run probe:0g-router
```

The probe performs live `/models` discovery and one strict-JSON inference, then writes only non-secret evidence to:

```text
artifacts/0g-router-preflight.json
```

ReceiptGate also preserves the older provider-account shape:

```text
ZG_SERVICE_URL=<provider service URL>
ZG_MODEL=<provider model>
ZG_API_SECRET=app-sk-...
```

The runtime detects `router-api.0g.ai` and uses `/v1/chat/completions`; provider URLs continue to use `/v1/proxy/chat/completions`.

## 2. Agentic ID candidate-bound ServeProof

`RECEIPTGATE_AGENT_URL` alone proves the running identity through signed `/hello`. It is not a candidate proof.

To make ServeProof an execution precondition, configure both:

```text
RECEIPTGATE_AGENT_URL=<running Agentic ID public URL>
RECEIPTGATE_AGENT_SERVICE_PATH=/api/receiptgate
ZERO_G_ATTESTOR_URL=https://agenticid.0g.ai
```

The service path must be `/api/*`; only that outward Agentic ID service surface is stamped with `X-Agent-Proof`.

Inside the running Agentic ID sandbox, run the repository bootstrap script:

```bash
bash scripts/agentic-id-receipt-service-bootstrap.sh
```

If the repository is not present in the sandbox, fetch the exact reviewed script from the repository commit you intend to run, inspect it, and execute it locally in the sandbox. Do not pipe an unreviewed moving `main` URL directly to a shell.

The script:

1. starts a loopback-only Node service on `127.0.0.1:9099`;
2. recomputes the canonical ReceiptGate candidate SHA-256 from the request body;
3. rejects a mismatched supplied `candidateHash`;
4. registers `/api/receiptgate` through `$SEAL_SIGN_SOCK/services`;
5. reads the service registry back.

The sealed proxy, not the script, supplies the external `X-Agent-Proof`.

## 3. Execution semantics

When `RECEIPTGATE_AGENT_SERVICE_PATH` is absent, the existing live path remains:

```text
wallet authorization
+ two live 0G inference calls
+ exact handoff binding
+ deterministic policy
-> execute/block
```

When the signed service path is configured, ServeProof becomes mandatory before the bounded side effect is reachable:

```text
wallet authorization
+ ProcurementAgent
+ exact handoff hash
+ RiskAgent
+ Agentic ID signed /api/* response
+ response candidateHash binding
+ ServeProof verifyProof()
+ deterministic policy
-> execute/block
```

A configured-but-missing, invalid, expired, wrong-signer, off-chain-data, or candidate-mismatched ServeProof forces:

```text
policy.allowed = false
execution.status = blocked
sideEffectCalls = 0
```

This proof means a particular sealed Agentic ID service signed a response bound to the exact execution candidate. It does **not** claim the model output is semantically true.

## 4. Vercel production readback

After setting the server-side environment variables and redeploying, verify:

```text
https://receiptgate.vercel.app/api/config
```

Expected Router state:

```json
{
  "computeConfigured": true,
  "computeTransport": "0g-router",
  "computeModel": "0gm-1.0-35b-a3b"
}
```

Expected ServeProof state once the Agentic ID service is ready:

```json
{
  "agentConfigured": true,
  "serveProofConfigured": true,
  "serveProofServicePath": "/api/receiptgate"
}
```

Then use:

```text
https://receiptgate.vercel.app/director.html
```

Normal oracle:

```text
handoff.bound = true
serveProof.verified = true (when configured)
policy.allowed = true
sideEffectCalls = 1
```

Tamper oracle:

```text
handoff.bound = false
policy.allowed = false
sideEffectCalls = 0
```

Never put `PRIVATE_KEY`, seed phrase, or mnemonic in Vercel.
