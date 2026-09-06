#!/usr/bin/env bash
set -euo pipefail

mkdir -p artifacts
PORT="${DEMO_PORT:-3210}"
export DEMO_PORT="$PORT"

bun run demo:serve > artifacts/demo-server.log 2>&1 &
SERVER_PID=$!
cleanup(){ kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT

for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then break; fi
  sleep 0.1
done
curl -fsS "http://127.0.0.1:${PORT}/healthz"

curl -fsS -X POST -H 'content-type: application/json' -d '{"tamper":false}' "http://127.0.0.1:${PORT}/api/demo" > artifacts/demo-normal.json
curl -fsS -X POST -H 'content-type: application/json' -d '{"tamper":true}' "http://127.0.0.1:${PORT}/api/demo" > artifacts/demo-tamper.json

bun -e '
const normal=await Bun.file("artifacts/demo-normal.json").json();
const tamper=await Bun.file("artifacts/demo-tamper.json").json();
if(normal.receipt?.execution?.status!=="executed"||normal.sideEffectCalls!==1||normal.receipt?.verification?.ok!==true||normal.receipt?.policy?.allowed!==true) throw new Error("normal demo path invariant failed");
if(tamper.receipt?.execution?.status!=="blocked"||tamper.sideEffectCalls!==0||tamper.receipt?.verification?.checks?.candidateBinding!==false) throw new Error("tamper demo path invariant failed");
const summary={schema:"receiptgate-demo-smoke-v1",accepted:true,commit:process.env.TARGET_SHA??"local",normal:{status:normal.receipt.execution.status,sideEffectCalls:normal.sideEffectCalls,amount:normal.displayedAmount},tamper:{status:tamper.receipt.execution.status,sideEffectCalls:tamper.sideEffectCalls,amount:tamper.displayedAmount,candidateBinding:tamper.receipt.verification.checks.candidateBinding}};
await Bun.write("artifacts/demo-smoke.json",JSON.stringify(summary,null,2)+"\n"); console.log(JSON.stringify(summary));'

cat artifacts/demo-server.log
cat artifacts/demo-smoke.json
