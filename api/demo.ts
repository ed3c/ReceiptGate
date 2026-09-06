import { demoHandler } from "../demo/vercel";

Bun.serve({
  port: 0,
  fetch: demoHandler,
});
