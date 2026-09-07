import { routerNetwork } from "../adapters/0g/compute/transport";

export function hermesIData(serviceUrl: string, model: string, limits: { context: number; output: number }) {
  if (!routerNetwork(serviceUrl) || !serviceUrl.endsWith('/v1')) throw new Error('Hermes requires an exact supported Router /v1 URL');
  if (limits.context < 64000) throw new Error('Hermes requires a model with a real context window of at least 64000 tokens');
  if (!model || !Number.isSafeInteger(limits.context) || !Number.isSafeInteger(limits.output) || limits.output < 10 || limits.context <= limits.output) throw new Error('Invalid model catalog limits');
  return [
    { role: 'framework', plaintext: { name: 'hermes', package_version: 'v2026.7.20', schema_version: 1 } },
    { role: 'config.yaml', plaintext: { model: { provider: 'custom', default: model, base_url: serviceUrl, max_tokens: limits.output, context_length: limits.context }, terminal: { backend: 'local' } } },
    { role: 'SOUL.md', plaintext: 'You operate ReceiptGate candidate-binding service. Independently implement and register a local HTTP service when requested. Do not claim inference provenance or payment settlement. Never disclose credentials. Follow the sealed platform service registration contract.' },
  ];
}

export async function preflightHermes(serviceUrl: string, model: string, secret: string) {
  // Reject an invalid destination before transmitting credentials.
  if (!routerNetwork(serviceUrl) || !serviceUrl.endsWith('/v1')) throw new Error('Hermes requires an exact supported Router /v1 URL');
  const headers = { authorization: `Bearer ${secret}`, 'content-type': 'application/json' };
  const response = await fetch(`${serviceUrl}/models`, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Hermes catalog HTTP ${response.status}`);
  const catalog = await response.json() as any;
  const row = catalog.data?.find((x: any) => x.id === model);
  if (!row) throw new Error('Requested model is absent from the exact endpoint catalog');
  const iData = hermesIData(serviceUrl, model, { context: row.context_length, output: row.max_completion_tokens });
  const canary = await fetch(`${serviceUrl}/chat/completions`, { method: 'POST', headers, signal: AbortSignal.timeout(20000), body: JSON.stringify({
    model, max_tokens: Math.min(256, row.max_completion_tokens), messages: [{ role: 'user', content: 'Call receiptgate_probe with ok=true.' }],
    tools: [{ type: 'function', function: { name: 'receiptgate_probe', description: 'Test tool calling', parameters: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] } } }],
  }) });
  if (!canary.ok) throw new Error(`Hermes tool canary HTTP ${canary.status}`);
  const body = await canary.json() as any;
  const call = body.choices?.[0]?.message?.tool_calls?.[0]?.function;
  if (call?.name !== 'receiptgate_probe' || JSON.parse(call.arguments)?.ok !== true) throw new Error('Hermes model did not perform the required tool call');
  return iData;
}
