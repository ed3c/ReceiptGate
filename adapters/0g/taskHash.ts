import { concat, keccak256, toBytes, type Hex } from "viem";

export interface ZeroGTranscript {
  method: string;
  requestUri: string;
  requestBody: string | Uint8Array;
  responseBody: string | Uint8Array;
  statusCode: number;
}

function bytes(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? toBytes(value) : value;
}

/**
 * Mirrors 0G sealed/internal/proxy writeServeProof taskHash exactly:
 * keccak256(method || requestURI || keccak256(reqBody) ||
 *           keccak256(respBody) || decimal(statusCode)).
 *
 * This is transcript binding only. Signature / agent identity / on-chain data
 * verification remains owned by the official Agentic ID SDK.
 */
export function computeZeroGTaskHash(transcript: ZeroGTranscript): Hex {
  const requestHash = keccak256(bytes(transcript.requestBody));
  const responseHash = keccak256(bytes(transcript.responseBody));

  return keccak256(
    concat([
      toBytes(transcript.method),
      toBytes(transcript.requestUri),
      toBytes(requestHash),
      toBytes(responseHash),
      toBytes(String(transcript.statusCode)),
    ]),
  );
}
