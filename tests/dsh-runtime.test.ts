import { expect, test } from "bun:test";
import { dshIData, preflightDSH } from "../scripts/dsh-runtime";

test("sealed DSH pins Google with no 0G Compute or credentials", () => {
  const data = dshIData("gemini-fixture");
  expect(data[0].plaintext).toEqual({ name: "dsh", package_version: "0.1.1-rc.2", schema_version: 1 });
  expect(data[1].plaintext.inference).toEqual({ provider: "google", model: "gemini-fixture" });
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
    expect(new URL(String(url)).origin).toBe("https://generativelanguage.googleapis.com");
    if (!String(url).endsWith(":generateContent")) return Response.json({ name: "models/gemini-fixture", supportedGenerationMethods: ["generateContent"] });
    if (mode === "quota") return Response.json({ error: { message: "secret-do-not-echo" } }, { status: 429 });
    return Response.json({ candidates: [{ content: { parts: mode === "pass" ? [{ functionCall: { name: "receiptgate_probe", args: { ok: true } } }] : [{ text: "I would call a tool" }] } }] });
  }) as typeof fetch;
  try {
    expect(await preflightDSH("gemini-fixture", "test-key")).toEqual(dshIData("gemini-fixture"));
    mode = "text";
    await expect(preflightDSH("gemini-fixture", "test-key")).rejects.toThrow("required tool call");
    mode = "quota";
    await expect(preflightDSH("gemini-fixture", "test-key")).rejects.toThrow("HTTP 429; deployment not started");
    expect(requests).toBe(6);
    await expect(preflightDSH("gemini-fixture", "")).rejects.toThrow("GEMINI_API_KEY");
    expect(requests).toBe(6);
  } finally { globalThis.fetch = original; }
});
