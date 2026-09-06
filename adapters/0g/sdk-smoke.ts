import { AgenticID } from "@0gfoundation/0g-agenticid-sdk";

if (typeof AgenticID?.fromAttestor !== "function") {
  throw new Error("official 0G AgenticID SDK is missing AgenticID.fromAttestor");
}

console.log(
  JSON.stringify({
    schema: "receiptgate-0g-sdk-smoke-v1",
    package: "@0gfoundation/0g-agenticid-sdk",
    api: "AgenticID.fromAttestor",
    available: true,
  }),
);
