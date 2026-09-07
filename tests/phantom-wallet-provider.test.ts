import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("root demo prefers Phantom EVM provider and falls back to generic EIP-1193", () => {
  expect(html).toContain("window.phantom?.ethereum||window.ethereum||null");
  expect(html).toContain("Phantom / EIP-1193 wallet not found");
});
