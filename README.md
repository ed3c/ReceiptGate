# ReceiptGate

**Cryptographic receipts before autonomous agents act.**

ReceiptGate is a proof-gated execution boundary: a high-impact side effect is unreachable unless the exact candidate action passes proof verification and deterministic policy.

```text
0G Compute / other candidate source
          |
          v
    CandidateAction
          |
          +----------------------+
                                 |
Agent / provider evidence        |
          |                      |
          v                      |
     ProofVerifier               |
          |                      |
          +-------> Policy <-----+
                       |
                       v
                  ReceiptGate
                  /        \
               PASS        FAIL
                |            |
            execute()       BLOCK
```

## Judge demo

The one-screen Bun demo has a guaranteed, cloud-proven gate path and separately labeled live 0G evidence panels.

```bash
./scripts/demo.sh fixture
# open http://localhost:3000
```

Buttons:

- **Run verified purchase**: `$247`, proof binding PASS, policy `<= $300` PASS, mock side effect executes once.
- **Tamper $247 -> $2,470**: the proof remains bound to `$247`, candidate binding fails, side effect stays zero.
- **Run live inference**: calls provisioned 0G Compute when configured; explicitly labeled `none-live-compute-only`.
- **Verify signed /hello**: verifies a freshly running Agentic ID via the official SDK without a wallet key.

The `demo-smoke` GitHub Action starts the real HTTP server on the exact candidate SHA and exercises both normal and tamper routes before merge.

## Private key / secret boundary

**Never commit `PRIVATE_KEY`. Do not use it in normal demo runtime.** It is needed only for one-time local Agentic ID provisioning. `.env`, key files and `secrets/` are gitignored.

The intended split is:

```text
local provisioning                GitHub / judge runtime
------------------                ----------------------
PRIVATE_KEY        ── never ──X→  repository / workflow
wallet signing                    ZG_API_SECRET (app-sk-*)
funding                           public service URL/model
Agentic ID deploy                 public Agentic ID URL
```

`ZG_API_SECRET` is a shorter-lived provider credential and may be stored in GitHub Actions secret storage for the event. `scripts/cleanup-demo-secret.sh` deletes it afterward.

## Complete live-demo runbook

Use a dedicated low-fund demo wallet. The unavoidable manual boundary is wallet/CLI authentication and copying the generated `app-sk-*` into your local environment. Everything after that is scripted.

### 1. Provision 0G Compute locally

```bash
cp .env.example .env
export ZG_PROVIDER_ADDRESS=<provider-address>
export ZG_DEPOSIT_AMOUNT=3
export ZG_PROVIDER_FUND_AMOUNT=1
bun run provision:compute
```

The official CLI performs network setup/login, funding, provider acknowledgement, model listing and `get-secret`. Copy the printed `app-sk-*` only into the shell:

```bash
export ZG_API_SECRET='app-sk-...'
export ZG_SERVICE_URL='<provider service URL>'
export ZG_MODEL='<model id>'
```

Do not write the secret into the repository.

### 2. Provision one running Agentic ID locally

The sealed runtime needs its inference API key. Reuse the short-lived Compute secret for the demo unless the provider gives you a separate agent runtime key:

```bash
export PRIVATE_KEY='0x...dedicated-demo-wallet-key...'
export AGENT_API_KEY="$ZG_API_SECRET"
export ZG_AGENT_MODEL="$ZG_MODEL"
bun run provision:agentic-id
```

The script waits for `running`, verifies signed `/hello`, and writes only public/non-secret data to `artifacts/agentic-id-provision.json`.

Then remove wallet material from runtime:

```bash
unset PRIVATE_KEY AGENT_API_KEY
export RECEIPTGATE_AGENT_URL="$(bun -e 'const r=await Bun.file("artifacts/agentic-id-provision.json").json();process.stdout.write(r.url)')"
```

### 3. Run the local judge UI in full live mode

```bash
./scripts/demo.sh live
```

Open `http://localhost:3000`. The guaranteed normal/tamper gate is available even if a live provider later becomes unavailable; live panels remain separately labeled.

### 4. Push the runtime secret and execute the combined GitHub live canary

```bash
./scripts/live-demo.sh
```

This command does not print the secret. It:

1. pipes `ZG_API_SECRET` to `gh secret set`;
2. dispatches `live-demo.yml` on `main` with only non-secret URL/model inputs;
3. watches the run until completion;
4. leaves an exact-head combined artifact containing live Compute, signed Agentic ID, normal gate and tamper-gate evidence.

After judging:

```bash
./scripts/cleanup-demo-secret.sh
```

## Physical evidence already landed

The exact-head GitHub Actions path proves the fail-closed core on Bun:

- valid proof + allowed policy -> execute exactly once;
- invalid proof -> zero executions;
- candidate tamper after proof -> zero executions;
- verifier outage -> zero executions;
- policy denial -> zero executions.

Run the zero-dependency core path:

```bash
bun run acceptance
```

## 0G Compute candidate adapter

0G Compute is intentionally a **candidate source, not authorization authority**.

`adapters/0g/compute/client.ts` calls a provisioned OpenAI-compatible 0G endpoint and accepts only strict JSON with the exact candidate fields. Prose, code fences, unexpected fields, invalid numbers, currency mismatch, and provider HTTP failures are rejected.

A model is still allowed to propose an amount above budget. The deterministic ReceiptGate policy owns that decision and blocks it. The planted control verifies `$301 > $300` leaves side-effect count at zero.

A successful live Compute receipt is deliberately labeled `proofBoundary = none-live-compute-only`; it is not an Agentic ID ServeProof.

## 0G Agentic ID adapter

ReceiptGate joins official `verifyProof()` (signer identity, expiry, on-chain data roots) with the sealed-proxy transcript `taskHash` and deterministic candidate extraction. The adapter unit oracle mocks the official SDK result only for composition tests; live provider proof is kept separate.

The public discovery probe previously observed 32 models and 78 deployments but no running public agent with a valid signed `/hello`; that RED availability receipt was retained. Issue #7 remains open until a freshly provisioned live agent passes.

## Agent context route

```text
AGENTS.md
  -> contracts/system-v1.md (system decisions only)
  -> exact Issue + nearest executable test
```

`docs/plans/` is N-class planning. `docs/prompts/` is P-class guidance. Neither is correctness authority.

## Hackathon proof story

```text
0G Compute proposes
       ↓
CandidateAction
       ↓
Agentic ID / provider proof + transcript binding
       ↓
ReceiptGate deterministic policy
       ↓
EXECUTE or BLOCK
```

For the judge demo, live Compute and live Agentic ID are shown as separate provider evidence until a signed application `/api/*` service binds the procurement candidate end-to-end. The UI never upgrades that non-claim into a live proof.
