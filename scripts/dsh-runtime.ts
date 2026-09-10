// Matches the official sealed DSH adapter's native pi-ai provider pin.
// No Router endpoint, literal credential, or fabricated context limit enters iData.
export function dshIData(model: string) {
  if (!/^[a-z0-9][a-z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(model)) throw new Error("An explicit OpenRouter provider/model ID is required");
  return [
    { role: "framework", plaintext: { name: "dsh", package_version: "0.1.1-rc.2", schema_version: 1 } },
    { role: "persona", plaintext: {
      system_prompt: "Operate the ReceiptGate candidate-binding service. Independently implement and register a service when requested, following the sealed platform contract. Never disclose credentials or claim that external model inference is sealed. Execution requires independent proof verification and deterministic policy.",
      inference: { provider: "openrouter", model },
    } },
  ];
}

export async function preflightDSH(model: string, key: string) {
  const iData = dshIData(model);
  if (!key.trim()) throw new Error("OPENROUTER_API_KEY is required");
  const base = "https://openrouter.ai/api/v1";
  const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };
  const catalogResponse = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!catalogResponse.ok) throw new Error(`OpenRouter model preflight HTTP ${catalogResponse.status}`);
  const catalog = await catalogResponse.json() as any;
  const row = catalog.data?.find((entry: any) => entry.id === model);
  if (!row?.supported_parameters?.includes("tools")) {
    throw new Error("Requested OpenRouter model is absent or does not support tools");
  }
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST", headers, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Call receiptgate_probe with ok=true." }],
      tools: [{ type: "function", function: { name: "receiptgate_probe", description: "Test tool calling", parameters: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } } }],
      tool_choice: "required",
      max_tokens: 512,
    }),
  });
  // Do not echo provider response bodies: they may contain request credentials.
  if (!response.ok) throw new Error(`OpenRouter tool preflight HTTP ${response.status}; deployment not started`);
  const body = await response.json() as any;
  const call = body.choices?.[0]?.message?.tool_calls?.[0]?.function;
  let args: any = null;
  try { args = JSON.parse(call?.arguments || "null"); } catch { /* Invalid tool JSON must fail closed below. */ }
  if (call?.name !== "receiptgate_probe" || args?.ok !== true) throw new Error("OpenRouter did not perform the required tool call");
  return iData;
}

if (import.meta.main) {
  const model = process.env.AGENT_MODEL?.trim() || "";
  try {
    await preflightDSH(model, process.env.OPENROUTER_API_KEY || "");
    console.log(JSON.stringify({ framework: "dsh", provider: "openrouter", model, toolCalling: true, sealedRuntimeVerified: false }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "DSH preflight failed";
    const secret = process.env.OPENROUTER_API_KEY;
    console.error(JSON.stringify({ toolCalling: false, deploymentStarted: false, error: secret ? message.replaceAll(secret, "[redacted]") : message }));
    process.exitCode = 1;
  }
}
