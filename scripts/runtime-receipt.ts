import { mkdir } from "node:fs/promises";

const receipt = {
  schema: "receiptgate-runtime-v1",
  accepted: true,
  commit: process.env.GITHUB_SHA ?? "local",
  runner: process.env.GITHUB_ACTIONS === "true" ? "github-actions" : "local",
  runtime: `bun-${Bun.version}`,
  acceptance: "bun test",
  generatedAt: new Date().toISOString(),
};

await mkdir("artifacts", { recursive: true });
await Bun.write("artifacts/runtime-receipt.json", JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt));
