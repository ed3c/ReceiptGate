import { liveAgentHandler } from "../../demo/vercel";

Bun.serve({
  port: 0,
  fetch: liveAgentHandler,
});
