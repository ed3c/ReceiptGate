import { configHandler } from "../demo/vercel";

Bun.serve({
  port: 0,
  fetch: configHandler,
});
