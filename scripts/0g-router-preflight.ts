import { mkdir } from "node:fs/promises";

const serviceUrl = process.env.ZG_SERVICE_URL?.trim();
const model = process.env.ZG_MODEL?.trim();
const apiSecret = process.env.ZG_API_SECRET?.trim();

if (!serviceUrl || !model || !apiSecret) {
  throw new Error("ZG_SERVICE_URL, ZG_MODEL, and ZG_API_SECRET are required");
}

const url = new URL(serviceUrl);
if (url.hostname !== "router-api.0g.ai") {
  throw new Error(`probe:0g-router expects the official Router host, got ${url.hostname}`);
}

const base = serviceUrl.replace(/\/+$/, "");
const v1Base = base.endsWith("/v1") ? base : `${base}/v1`;
const modelsUrl = `${v1Base}/models`;
const chatUrl = `${v1Base}/chat/completions`;
const headers = { authorization: `Bearer ${apiSecret}` };

const modelsStarted = Date.now();
const modelsResponse = await fetch(modelsUrl, {
  headers,
  signal: AbortSignal.timeout(15_000),
});
if (!modelsResponse.ok) {
  throw new Error(`0G Router /models HTTP ${modelsResponse.status}: ${(await modelsResponse.text()).slice(0, 240)}`);
}
const modelsPayload = await modelsResponse.json() as { data?: Array<{ id?: unknown }> };
const modelIds = Array.isArray(modelsPayload.data)
  ? modelsPayload.data.map((row) => typeof row?.id === "string" ? row.id : "").filter(Boolean)
  : [];
if (!modelIds.includes(model)) {
  throw new Error(`ZG_MODEL ${model} was not present in the live 0G Router catalog (${modelIds.length} models)`);
}

const inferenceStarted = Date.now();
const inferenceResponse = await fetch(chatUrl, {
  method: "POST",
  headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify({
    model,
    temperature: 0,
    max_tokens: 32,
    messages: [
      { role: "system", content: "Return ONLY strict JSON: {\"ok\":true}. No prose." },
      { role: "user", content: "ReceiptGate 0G Router preflight." },
    ],
  }),
  signal: AbortSignal.timeout(20_000),
});
if (!inferenceResponse.ok) {
  throw new Error(`0G Router inference HTTP ${inferenceResponse.status}: ${(await inferenceResponse.text()).slice(0, 240)}`);
}
const inferencePayload = await inferenceResponse.json() as { choices?: Array<{ message?: { content?: unknown } }> };
const content = inferencePayload.choices?.[0]?.message?.content;
if (typeof content !== "string") throw new Error("0G Router inference returned no message content");
let parsed: unknown;
try { parsed = JSON.parse(content); } catch { throw new Error("0G Router preflight response was not strict JSON"); }
if ((parsed as any)?.ok !== true) throw new Error(`0G Router preflight oracle mismatch: ${content.slice(0, 120)}`);

const receipt = {
  schema: "receiptgate-0g-router-preflight-v1",
  accepted: true,
  transport: "0g-router",
  serviceUrl: v1Base,
  model,
  modelCatalogCount: modelIds.length,
  modelFound: true,
  modelsLatencyMs: Date.now() - modelsStarted,
  inferenceLatencyMs: Date.now() - inferenceStarted,
  generatedAt: new Date().toISOString(),
};

await mkdir("artifacts", { recursive: true });
await Bun.write("artifacts/0g-router-preflight.json", JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt));
