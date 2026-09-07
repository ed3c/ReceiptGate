#!/usr/bin/env bash
set -euo pipefail

: "${SEAL_SIGN_SOCK:?SEAL_SIGN_SOCK is required inside an Agentic ID sandbox}"

SOCK="${SEAL_SIGN_SOCK#unix://}"
PORT="${RECEIPTGATE_SERVICE_PORT:-9099}"
SERVICE_PATH="${RECEIPTGATE_AGENT_SERVICE_PATH:-/api/receiptgate}"
SERVICE_FILE="/tmp/receiptgate-candidate-service.mjs"
PID_FILE="/tmp/receiptgate-candidate-service.pid"
LOG_FILE="/tmp/receiptgate-candidate-service.log"

if [[ "$SERVICE_PATH" != /api/* ]]; then
  echo "service path must start with /api/: $SERVICE_PATH" >&2
  exit 1
fi

cat > "$SERVICE_FILE" <<'JS'
import http from "node:http";
import crypto from "node:crypto";

const port = Number(process.env.RECEIPTGATE_SERVICE_PORT || "9099");
const servicePath = process.env.RECEIPTGATE_AGENT_SERVICE_PATH || "/api/receiptgate";

function canonicalCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("candidate object required");
  return JSON.stringify({
    id: candidate.id,
    kind: candidate.kind,
    target: candidate.target,
    amount: candidate.amount,
    currency: candidate.currency,
    payload: {
      product: candidate.payload?.product,
      units: candidate.payload?.units,
      quotedPrice: candidate.payload?.quotedPrice,
      sourceRisk: candidate.payload?.sourceRisk,
      sourceReason: candidate.payload?.sourceReason,
      computeModel: candidate.payload?.computeModel,
    },
  });
}

function hashCandidate(candidate) {
  return "0x" + crypto.createHash("sha256").update(canonicalCandidate(candidate), "utf8").digest("hex");
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url?.split("?")[0] !== servicePath) {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: "not found" }));
  }

  let body = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 64_000) req.destroy(new Error("body too large"));
  });
  req.on("end", () => {
    try {
      const parsed = JSON.parse(body);
      const suppliedHash = typeof parsed.candidateHash === "string" ? parsed.candidateHash.toLowerCase() : "";
      const computedHash = hashCandidate(parsed.candidate);
      if (!/^0x[0-9a-f]{64}$/.test(suppliedHash) || suppliedHash !== computedHash) {
        res.writeHead(409, { "content-type": "application/json" });
        return res.end(JSON.stringify({
          accepted: false,
          candidateHash: computedHash,
          reason: "candidateHash does not match canonical candidate bytes",
        }));
      }
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify({
        accepted: true,
        candidateHash: computedHash,
        service: "receiptgate-candidate-binding-v1",
      }));
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(JSON.stringify({ phase: "receiptgate-service-listening", port, servicePath }));
});
JS

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  kill "$(cat "$PID_FILE")" || true
  sleep 0.2
fi

RECEIPTGATE_SERVICE_PORT="$PORT" RECEIPTGATE_AGENT_SERVICE_PATH="$SERVICE_PATH" \
  nohup node "$SERVICE_FILE" >"$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

for _ in $(seq 1 30); do
  if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    break
  fi
  sleep 0.1
done
kill -0 "$(cat "$PID_FILE")" 2>/dev/null || { cat "$LOG_FILE" >&2; exit 1; }

INPUT_EXAMPLE='{"purpose":"receiptgate-candidate-binding","candidateHash":"0x…","candidate":{"id":"…"}}'
REGISTRATION=$(printf '{"services":[{"path":"%s","method":"POST","description":"Recompute and bind the exact ReceiptGate execution candidate before authorization.","input_example":"%s","backend":"http://127.0.0.1:%s"}]}' \
  "$SERVICE_PATH" "${INPUT_EXAMPLE//\"/\\\"}" "$PORT")

curl --silent --show-error --fail \
  --unix-socket "$SOCK" \
  -H 'content-type: application/json' \
  -X POST \
  --data "$REGISTRATION" \
  http://localhost/services

echo
curl --silent --show-error --fail --unix-socket "$SOCK" http://localhost/services
echo
printf '{"phase":"receiptgate-service-registered","path":"%s","port":%s}\n' "$SERVICE_PATH" "$PORT"
