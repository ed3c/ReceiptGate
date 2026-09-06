#!/usr/bin/env bash
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  echo "Compute wallet provisioning is local-only by default." >&2
  exit 2
fi

command -v 0g-compute-cli >/dev/null 2>&1 || {
  echo "0g-compute-cli is required. Install the official @0gfoundation/0g-compute-ts-sdk CLI first." >&2
  exit 2
}

PROVIDER="${ZG_PROVIDER_ADDRESS:-}"
DEPOSIT="${ZG_DEPOSIT_AMOUNT:-3}"
PROVIDER_FUND="${ZG_PROVIDER_FUND_AMOUNT:-1}"
TOKEN_ID="${ZG_TOKEN_ID:-7}"

0g-compute-cli setup-network
0g-compute-cli login
0g-compute-cli get-account

if [[ -z "$PROVIDER" ]]; then
  echo
  echo "No ZG_PROVIDER_ADDRESS set. Choose one from the live list, export it, then rerun:" >&2
  0g-compute-cli inference list-providers
  exit 3
fi

if [[ "${ZG_SKIP_FUNDING:-0}" != "1" ]]; then
  0g-compute-cli deposit --amount "$DEPOSIT"
  0g-compute-cli transfer-fund --provider "$PROVIDER" --amount "$PROVIDER_FUND"
fi

0g-compute-cli inference acknowledge-provider --provider "$PROVIDER"
0g-compute-cli inference get-models --provider "$PROVIDER" || true

echo
echo "The next command prints a runtime app-sk-* secret to THIS LOCAL TERMINAL."
echo "Do not redirect it to a repo file. Copy only the secret into GitHub Actions secret ZG_API_SECRET."
0g-compute-cli inference get-secret --provider "$PROVIDER" --token-id "$TOKEN_ID"
