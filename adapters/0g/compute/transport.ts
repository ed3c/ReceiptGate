/** Router identity describes transport, never proof or model availability. */
export function routerNetwork(serviceUrl: string): "mainnet" | "testnet" | null {
  let url: URL;
  try { url = new URL(serviceUrl); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (!["/v1", "/v1/", "/v1/chat/completions"].includes(url.pathname) || url.search || url.hash) return null;
  if (url.hostname === "router-api.0g.ai") return "mainnet";
  if (url.hostname === "router-api-testnet.integratenetwork.work") return "testnet";
  return null;
}

export function classifyComputeTransport(serviceUrl: string): "0g-router" | "0g-compute-provider" {
  return routerNetwork(serviceUrl) ? "0g-router" : "0g-compute-provider";
}
