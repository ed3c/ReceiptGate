import { configHandler } from "../demo/vercel";

Bun.serve({
  fetch: configHandler,
});
