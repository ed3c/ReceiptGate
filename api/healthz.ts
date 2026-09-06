import { healthHandler } from "../demo/vercel";

Bun.serve({
  fetch: healthHandler,
});
