#!/usr/bin/env bash
set -euo pipefail

REPO="${RECEIPTGATE_REPO:-ed3c/ReceiptGate}"
command -v gh >/dev/null 2>&1 || { echo "GitHub CLI (gh) is required" >&2; exit 2; }

if [[ -n "${PRIVATE_KEY:-}" ]]; then
  echo "Refusing live runtime launch while PRIVATE_KEY is present. Provision Agentic ID first, then unset PRIVATE_KEY." >&2
  exit 3
fi

: "${ZG_API_SECRET:?export the provisioned app-sk-* value as ZG_API_SECRET}"
: "${ZG_SERVICE_URL:?export ZG_SERVICE_URL from the provisioned 0G Compute provider}"
: "${ZG_MODEL:?export ZG_MODEL}"

case "$ZG_API_SECRET" in app-sk-*) ;; *) echo "ZG_API_SECRET must have app-sk-* shape" >&2; exit 4;; esac

AGENT_URL="${RECEIPTGATE_AGENT_URL:-}"
if [[ -z "$AGENT_URL" && -f artifacts/agentic-id-provision.json ]]; then
  AGENT_URL="$(bun -e 'const r=await Bun.file("artifacts/agentic-id-provision.json").json(); if(r.url) process.stdout.write(r.url)')"
fi
: "${AGENT_URL:?export RECEIPTGATE_AGENT_URL or run provision:agentic-id first}"

printf '%s' "$ZG_API_SECRET" | gh secret set ZG_API_SECRET --repo "$REPO"
echo "Stored short-lived ZG_API_SECRET in GitHub Actions secret storage for $REPO (value not printed)."

BEFORE="$(gh run list --repo "$REPO" --workflow live-demo.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId // 0' 2>/dev/null || echo 0)"
gh workflow run live-demo.yml --repo "$REPO" --ref main \
  -f service_url="$ZG_SERVICE_URL" \
  -f model="$ZG_MODEL" \
  -f agent_url="$AGENT_URL"

RUN_ID=""
for _ in $(seq 1 30); do
  CANDIDATE="$(gh run list --repo "$REPO" --workflow live-demo.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId // 0')"
  if [[ -n "$CANDIDATE" && "$CANDIDATE" != "0" && "$CANDIDATE" != "$BEFORE" ]]; then RUN_ID="$CANDIDATE"; break; fi
  sleep 1
done

if [[ -z "$RUN_ID" ]]; then
  echo "Workflow was dispatched but a new run id was not discovered. Inspect Actions manually." >&2
  exit 5
fi

echo "Watching live-demo workflow run $RUN_ID..."
gh run watch "$RUN_ID" --repo "$REPO" --exit-status
gh run view "$RUN_ID" --repo "$REPO" --json url,conclusion --jq '"Live demo: " + .conclusion + "\n" + .url'
