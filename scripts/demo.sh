#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-fixture}"
case "$MODE" in
  fixture|live-compute|live-agent|live) ;;
  *) echo "usage: ./scripts/demo.sh [fixture|live-compute|live-agent|live]" >&2; exit 2 ;;
esac

if [[ -n "${PRIVATE_KEY:-}" ]]; then
  echo "Refusing to start judge runtime while PRIVATE_KEY is present. Provision first, then unset it." >&2
  exit 3
fi

bun run demo:doctor "$MODE"
export DEMO_MODE="$MODE"
exec bun run demo:serve
