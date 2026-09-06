import { runFixtureScenario } from "./fixture";
import { liveAgentEvidence, liveComputeEvidence } from "./live";

if (process.env.GITHUB_ACTIONS === "true" && process.env.PRIVATE_KEY?.trim()) {
  throw new Error("PRIVATE_KEY must not enter the judge-demo GitHub Actions runtime");
}

const port = Number(process.env.DEMO_PORT ?? 3000);
const html = await Bun.file(new URL("./index.html", import.meta.url)).text();

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/app-sk-[A-Za-z0-9._-]+/g, "[redacted-api-secret]").slice(0, 400);
}

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/") {
        return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
      }
      if (request.method === "GET" && url.pathname === "/healthz") {
        return json({ ok: true, service: "receiptgate-demo", port });
      }
      if (request.method === "GET" && url.pathname === "/api/config") {
        return json({
          computeConfigured: Boolean(process.env.ZG_SERVICE_URL?.trim() && process.env.ZG_MODEL?.trim() && process.env.ZG_API_SECRET?.trim()),
          agentConfigured: Boolean(process.env.RECEIPTGATE_AGENT_URL?.trim()),
          privateKeyInRuntime: Boolean(process.env.PRIVATE_KEY?.trim()),
        });
      }
      if (request.method === "POST" && url.pathname === "/api/demo") {
        const body = await request.json().catch(() => ({})) as { tamper?: boolean };
        return json(await runFixtureScenario(body.tamper === true));
      }
      if (request.method === "POST" && url.pathname === "/api/live/compute") {
        return json(await liveComputeEvidence());
      }
      if (request.method === "GET" && url.pathname === "/api/live/agent") {
        return json(await liveAgentEvidence());
      }
      return json({ error: "not found" }, 404);
    } catch (error) {
      return json({ error: safeError(error) }, 503);
    }
  },
});

console.log(JSON.stringify({ schema: "receiptgate-demo-server-v1", listening: true, port: server.port, privateKeyInRuntime: false }));
