import { walletVerifyHandler } from "../../demo/vercel";

Bun.serve({
  port: 0,
  fetch: walletVerifyHandler,
});
