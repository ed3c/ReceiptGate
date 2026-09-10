// Matches the official sealed DSH adapter's native pi-ai provider pin.
// No Router endpoint, literal credential, or fabricated context limit enters iData.
export function dshIData(model: string) {
  if (!/^gemini-[a-z0-9.-]+$/.test(model)) throw new Error("An explicit Gemini model ID is required");
  return [
    { role: "framework", plaintext: { name: "dsh", package_version: "0.1.1-rc.2", schema_version: 1 } },
    { role: "persona", plaintext: {
      system_prompt: "Operate the ReceiptGate candidate-binding service. Independently implement and register a service when requested, following the sealed platform contract. Never disclose credentials or claim that external model inference is sealed. Execution requires independent proof verification and deterministic policy.",
      inference: { provider: "google", model },
    } },
  ];
}

export async function preflightDSH(model: string, key: string) {
  const iData = dshIData(model);
  if (!key.trim()) throw new Error("GEMINI_API_KEY is required");
  const base = "https://generativelanguage.googleapis.com/v1beta";
  const headers = { "x-goog-api-key": key, "content-type": "application/json" };
  const catalogResponse = await fetch(`${base}/models/${model}`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!catalogResponse.ok) throw new Error(`Gemini model preflight HTTP ${catalogResponse.status}`);
  const catalog = await catalogResponse.json() as any;
  if (catalog.name !== `models/${model}` || !catalog.supportedGenerationMethods?.includes("generateContent")) {
    throw new Error("Requested Gemini model does not support generation");
  }
  const response = await fetch(`${base}/models/${model}:generateContent`, {
    method: "POST", headers, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Call receiptgate_probe with ok=true." }] }],
      tools: [{ functionDeclarations: [{ name: "receiptgate_probe", description: "Test tool calling", parameters: { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] } }] }],
      toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["receiptgate_probe"] } },
      generationConfig: { maxOutputTokens: 512 },
    }),
  });
  // Do not echo provider response bodies: they may contain request credentials.
  if (!response.ok) throw new Error(`Gemini tool preflight HTTP ${response.status}; deployment not started`);
  const body = await response.json() as any;
  const call = body.candidates?.[0]?.content?.parts?.find((p: any) => p.functionCall)?.functionCall;
  if (call?.name !== "receiptgate_probe" || call?.args?.ok !== true) throw new Error("Gemini did not perform the required tool call");
  return iData;
}

if (import.meta.main) {
  const model = process.env.AGENT_MODEL?.trim() || "";
  try {
    await preflightDSH(model, process.env.GEMINI_API_KEY || "");
    console.log(JSON.stringify({ framework: "dsh", provider: "google", model, toolCalling: true, sealedRuntimeVerified: false }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "DSH preflight failed";
    const secret = process.env.GEMINI_API_KEY;
    console.error(JSON.stringify({ toolCalling: false, deploymentStarted: false, error: secret ? message.replaceAll(secret, "[redacted]") : message }));
    process.exitCode = 1;
  }
}
