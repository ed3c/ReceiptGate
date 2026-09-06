import { liveComputeHandler } from "../../demo/vercel";

Bun.serve({
  port: 0,
  fetch: liveComputeHandler,
});
