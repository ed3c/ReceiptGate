import { describe, expect, test } from "bun:test";
import { privateKeyToAccount } from "viem/accounts";
import {
  createWalletChallenge,
  GALILEO_CHAIN_ID,
  verifyWalletAuthorization,
} from "../demo/wallet";

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const NOW = 1_800_000_000_000;

describe("browser wallet authorization", () => {
  test("valid Galileo wallet signature authorizes the exact candidate", async () => {
    const challenge = createWalletChallenge(account.address, NOW);
    const signature = await account.signMessage({ message: challenge.message });
    const receipt = await verifyWalletAuthorization({
      address: account.address,
      message: challenge.message,
      signature,
      nowMs: NOW + 1_000,
    });
    expect(receipt.ok).toBe(true);
    expect(receipt.chainId).toBe(GALILEO_CHAIN_ID);
    expect(receipt.checks.signature).toBe(true);
    expect(receipt.checks.candidateHash).toBe(true);
  });

  test("tampering the signed candidate amount fails closed", async () => {
    const challenge = createWalletChallenge(account.address, NOW);
    const signature = await account.signMessage({ message: challenge.message });
    const tampered = challenge.message.replace("amount=247", "amount=2470");
    const receipt = await verifyWalletAuthorization({
      address: account.address,
      message: tampered,
      signature,
      nowMs: NOW + 1_000,
    });
    expect(receipt.ok).toBe(false);
    expect(receipt.checks.amount).toBe(false);
    expect(receipt.checks.signature).toBe(false);
  });

  test("expired wallet authorization fails closed", async () => {
    const challenge = createWalletChallenge(account.address, NOW);
    const signature = await account.signMessage({ message: challenge.message });
    const receipt = await verifyWalletAuthorization({
      address: account.address,
      message: challenge.message,
      signature,
      nowMs: challenge.expiresAtMs + 1,
    });
    expect(receipt.ok).toBe(false);
    expect(receipt.checks.freshness).toBe(false);
  });
});
