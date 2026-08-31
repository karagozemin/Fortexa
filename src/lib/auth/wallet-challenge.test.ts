import { Keypair } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildChallengeMessage,
  createWalletChallenge,
  hashSep53Message,
  isChallengeExpired,
  resetWalletChallengeStore,
  verifyWalletChallenge,
  verifyWalletSignature,
} from "@/lib/auth/wallet-challenge";

const TEST_SECRET = "SAKICEVQLYWGSOJS4WW7HZJWAHZVEEBS527LHK5V4MLJALYKICQCJXMW";
const TEST_PUBLIC_KEY = "GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L";

function signSep53Message(secret: string, message: string) {
  const keypair = Keypair.fromSecret(secret);
  return keypair.sign(hashSep53Message(message)).toString("base64");
}

describe("wallet challenge", () => {
  afterEach(async () => {
    vi.useRealTimers();
    delete process.env.FORTEXA_AUTH_CHALLENGE_TTL_SECONDS;
    await resetWalletChallengeStore();
  });

  it("creates a challenge message bound to wallet and expiry", async () => {

    const challenge = await createWalletChallenge(TEST_PUBLIC_KEY);

    expect(challenge.message).toContain(`Wallet: ${TEST_PUBLIC_KEY}`);
    expect(challenge.message).toContain(`Challenge: ${challenge.id}`);
    expect(challenge.expiresAtMs).toBeGreaterThan(Date.now());
    expect(buildChallengeMessage({
      challengeId: challenge.id,
      publicKey: challenge.publicKey,
      expiresAtMs: challenge.expiresAtMs,
    })).toBe(challenge.message);
  });

  it("verifies a valid SEP-53 signature and consumes the challenge", async () => {

    const challenge = await createWalletChallenge(TEST_PUBLIC_KEY);
    const signature = signSep53Message(TEST_SECRET, challenge.message);

    expect(verifyWalletSignature(TEST_PUBLIC_KEY, challenge.message, signature)).toBe(true);

    const verified = await verifyWalletChallenge({
      challengeId: challenge.id,
      publicKey: TEST_PUBLIC_KEY,
      signature,
    });

    expect(verified.ok).toBe(true);

    const replayed = await verifyWalletChallenge({
      challengeId: challenge.id,
      publicKey: TEST_PUBLIC_KEY,
      signature,
    });

    expect(replayed).toEqual({ ok: false, code: "replayed" });
  });

  it("rejects expired challenges", async () => {
    vi.useFakeTimers();
    process.env.FORTEXA_AUTH_CHALLENGE_TTL_SECONDS = "60";

    const challenge = await createWalletChallenge(TEST_PUBLIC_KEY);
    const signature = signSep53Message(TEST_SECRET, challenge.message);

    vi.advanceTimersByTime(61_000);

    const result = await verifyWalletChallenge({
      challengeId: challenge.id,
      publicKey: TEST_PUBLIC_KEY,
      signature,
    });

    expect(result).toEqual({ ok: false, code: "expired" });
  });

  it("rejects invalid signatures without allowing replay", async () => {

    const challenge = await createWalletChallenge(TEST_PUBLIC_KEY);
    const otherKeypair = Keypair.random();
    const badSignature = otherKeypair.sign(hashSep53Message(challenge.message)).toString("base64");

    const result = await verifyWalletChallenge({
      challengeId: challenge.id,
      publicKey: TEST_PUBLIC_KEY,
      signature: badSignature,
    });

    expect(result).toEqual({ ok: false, code: "invalid_signature" });

    const replayed = await verifyWalletChallenge({
      challengeId: challenge.id,
      publicKey: TEST_PUBLIC_KEY,
      signature: badSignature,
    });

    expect(replayed).toEqual({ ok: false, code: "replayed" });
  });
  describe("expiry boundary", () => {
    // `expiresAtMs` is the first instant at which a challenge is invalid, so the
    // comparison is inclusive. These tests pin that equality behavior exactly:
    // one millisecond earlier still authenticates, the stated instant does not.
    it("treats the exact expiry instant as expired", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      process.env.FORTEXA_AUTH_CHALLENGE_TTL_SECONDS = "60";

      const challenge = await createWalletChallenge(TEST_PUBLIC_KEY);
      const signature = signSep53Message(TEST_SECRET, challenge.message);

      vi.setSystemTime(challenge.expiresAtMs);

      const result = await verifyWalletChallenge({
        challengeId: challenge.id,
        publicKey: TEST_PUBLIC_KEY,
        signature,
      });

      expect(result).toEqual({ ok: false, code: "expired" });
    });

    it("accepts a challenge one millisecond before expiry", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      process.env.FORTEXA_AUTH_CHALLENGE_TTL_SECONDS = "60";

      const challenge = await createWalletChallenge(TEST_PUBLIC_KEY);
      const signature = signSep53Message(TEST_SECRET, challenge.message);

      vi.setSystemTime(challenge.expiresAtMs - 1);

      const result = await verifyWalletChallenge({
        challengeId: challenge.id,
        publicKey: TEST_PUBLIC_KEY,
        signature,
      });

      expect(result.ok).toBe(true);
    });

    it("reports the inclusive boundary through isChallengeExpired", () => {
      expect(isChallengeExpired(1_000, 999)).toBe(false);
      expect(isChallengeExpired(1_000, 1_000)).toBe(true);
      expect(isChallengeExpired(1_000, 1_001)).toBe(true);
    });
  });

  describe("expiry precedence", () => {
    it("reports expiry rather than wallet mismatch for an expired challenge", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      process.env.FORTEXA_AUTH_CHALLENGE_TTL_SECONDS = "60";

      const challenge = await createWalletChallenge(TEST_PUBLIC_KEY);
      const otherWallet = Keypair.random().publicKey();

      vi.setSystemTime(challenge.expiresAtMs);

      const result = await verifyWalletChallenge({
        challengeId: challenge.id,
        publicKey: otherWallet,
        signature: "",
      });

      expect(result).toEqual({ ok: false, code: "expired" });
    });

    it("purges an expired challenge even when the wallet does not match", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      process.env.FORTEXA_AUTH_CHALLENGE_TTL_SECONDS = "60";

      const challenge = await createWalletChallenge(TEST_PUBLIC_KEY);
      const signature = signSep53Message(TEST_SECRET, challenge.message);

      vi.setSystemTime(challenge.expiresAtMs);

      await verifyWalletChallenge({
        challengeId: challenge.id,
        publicKey: Keypair.random().publicKey(),
        signature: "",
      });

      // The record is gone, not merely reported as expired.
      const afterPurge = await verifyWalletChallenge({
        challengeId: challenge.id,
        publicKey: TEST_PUBLIC_KEY,
        signature,
      });

      expect(afterPurge).toEqual({ ok: false, code: "missing" });
    });

    it("does not consume a challenge that expired before verification", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      process.env.FORTEXA_AUTH_CHALLENGE_TTL_SECONDS = "60";

      const challenge = await createWalletChallenge(TEST_PUBLIC_KEY);

      vi.setSystemTime(challenge.expiresAtMs + 5_000);

      const result = await verifyWalletChallenge({
        challengeId: challenge.id,
        publicKey: TEST_PUBLIC_KEY,
        signature: signSep53Message(TEST_SECRET, challenge.message),
      });

      expect(result).toEqual({ ok: false, code: "expired" });
    });
  });
});
