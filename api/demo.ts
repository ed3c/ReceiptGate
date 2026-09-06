function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/app-sk-[A-Za-z0-9._-]+/g, "[redacted-api-secret]").slice(0, 400);
}

export default {
  async fetch(request: Request) {
    try {
      const body = (await request.json().catch(() => ({}))) as { tamper?: boolean };
      const { runFixtureScenario } = await import("../demo/fixture.ts");
      return Response.json(await runFixtureScenario(body.tamper === true), {
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      return Response.json({ error: safeError(error) }, { status: 503 });
    }
  },
};
