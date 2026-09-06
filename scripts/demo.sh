#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-fixture}"
case "$MODE" in
  fixture|live-compute|live-agent|live) ;;
  *) echo "usage: ./scripts/demo.sh [fixture|live-compute|live-agent|live]" >&2; exit 2 ;;
esac

bun run demo:doctor "$MODE"

echo
echo "ReceiptGate demo prerequisites for '$MODE' are ready."
if [[ -f demo/server.ts ]]; then
  export DEMO_MODE="$MODE"
  exec bun run demo:serve
fi

echo "Judge-facing UI has not been landed on this atom yet; run the next demo-runtime atom after merge." >&2
