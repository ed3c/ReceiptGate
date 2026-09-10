import { expect, test } from "bun:test";
import { dshIData, preflightDSH } from "../scripts/dsh-runtime";

test("sealed DSH pins OpenRouter with no 0G Compute or credentials", () => {
  const data = dshIData("test/model");
  expect(data[0].plaintext).toEqual({ name: "dsh", package_version: "0.1.1-rc.2", schema_version: 1 });
  expect(data[1].plaintext.inference).toEqual({ provider: "openrouter", model: "test/model" });
  expect(JSON.stringify(data)).not.toContain("api_key");
  expect(JSON.stringify(data)).not.toContain("router-api");
  expect(() => dshIData("../untrusted")).toThrow();
});

test("DSH preflight requires an actual tool call and rejects depleted credit", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  let mode = "pass";
  globalThis.fetch = (async (url: any) => {
    requests++;
    expect(new URL(String(url)).origin).toBe("https://openrouter.ai");
    if (!String(url).endsWith("/chat/completions")) return Response.json({ data: [{ id: "test/model", supported_parameters: ["tools"] }] });
    if (mode === "quota") return Response.json({ error: { message: "secret-do-not-echo" } }, { status: 429 });
    return Response.json({ choices: [{ message: mode === "pass" ? { tool_calls: [{ function: { name: "receiptgate_probe", arguments: "{\"ok\":true}" } }] } : { content: "I would call a tool" } }] });
  }) as typeof fetch;
  try {
    expect(await preflightDSH("test/model", "test-key")).toEqual(dshIData("test/model"));
    mode = "text";
    await expect(preflightDSH("test/model", "test-key")).rejects.toThrow("required tool call");
    mode = "quota";
    await expect(preflightDSH("test/model", "test-key")).rejects.toThrow("HTTP 429; deployment not started");
    expect(requests).toBe(6);
    await expect(preflightDSH("test/model", "")).rejects.toThrow("OPENROUTER_API_KEY");
    expect(requests).toBe(6);
  } finally { globalThis.fetch = original; }
});
