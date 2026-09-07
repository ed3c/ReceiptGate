const address = (process.argv[2] || process.env.ZG_WALLET_ADDRESS || "").trim();
const rpc = process.env.ZG_RPC_URL || "https://evmrpc-testnet.0g.ai";
if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("valid EVM address required via argv[2] or ZG_WALLET_ADDRESS");
async function rpcCall(method, params = []) {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`${method} failed: ${JSON.stringify(body.error || body)}`);
  return body.result;
}
const [chainIdHex, balanceHex] = await Promise.all([
  rpcCall("eth_chainId"),
  rpcCall("eth_getBalance", [address, "latest"]),
]);
const chainId = Number(BigInt(chainIdHex));
if (chainId !== 16602) throw new Error(`wrong chain: expected 16602, got ${chainId}`);
const wei = BigInt(balanceHex);
const whole = wei / 10n ** 18n;
const frac = (wei % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
const og = frac ? `${whole}.${frac}` : whole.toString();
console.log(JSON.stringify({
  network: "0G Galileo Testnet",
  chainId,
  address,
  balanceHex,
  balanceWei: wei.toString(),
  balanceOG: og,
}, null, 2));
