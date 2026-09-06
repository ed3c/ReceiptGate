import { walletChallengeHandler } from "../../demo/vercel";

Bun.serve({
  port: 0,
  fetch: walletChallengeHandler,
});
