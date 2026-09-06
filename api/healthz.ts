import { healthHandler } from "../demo/vercel";

Bun.serve({
  port: 0,
  fetch: healthHandler,
});
