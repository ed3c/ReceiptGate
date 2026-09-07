import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("root demo resolves EIP-1193 from iframe top/parent and prefers MetaMask", () => {
  expect(html).toContain("function getEip1193Provider()");
  expect(html).toContain("window.top");
  expect(html).toContain("p.isMetaMask");
  expect(html).toContain("Install MetaMask, Rabby, or Phantom (EVM) and reload");
});
