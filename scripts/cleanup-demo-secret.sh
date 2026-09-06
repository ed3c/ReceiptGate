#!/usr/bin/env bash
set -euo pipefail
REPO="${RECEIPTGATE_REPO:-ed3c/ReceiptGate}"
command -v gh >/dev/null 2>&1 || { echo "GitHub CLI (gh) is required" >&2; exit 2; }
gh secret delete ZG_API_SECRET --repo "$REPO"
echo "Deleted ZG_API_SECRET from GitHub Actions secret storage for $REPO."
