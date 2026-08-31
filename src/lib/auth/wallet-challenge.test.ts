import { Keypair } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildChallengeMessage,
  createWalletChallenge,
  hashSep53Message,
  resetWalletChallengeStore,
  verifyWalletChallenge,
  verifyWalletSignature,
} from "@/lib/auth/wallet-challenge";
import * as sharedSecurityState from "@/lib/security/shared-security-state";

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

  it("rejects concurrent verification attempts for the same challenge", async () => {
    const challenge = await createWalletChallenge(TEST_PUBLIC_KEY);
    const signature = signSep53Message(TEST_SECRET, challenge.message);

    const originalRead = sharedSecurityState.readSharedChallenge.bind(sharedSecurityState);
    let allowReads = false;
    let readsStarted = 0;

    vi.spyOn(sharedSecurityState, "readSharedChallenge").mockImplementation(async (challengeId) => {
      if (challengeId !== challenge.id) {
        return originalRead(challengeId);
      }

      readsStarted += 1;
      if (readsStarted === 2) {
        await Promise.resolve();
      }

      while (!allowReads) {
        await Promise.resolve();
      }

      return originalRead(challengeId);
    });

    const first = verifyWalletChallenge({
      challengeId: challenge.id,
      publicKey: TEST_PUBLIC_KEY,
      signature,
    });

    const second = verifyWalletChallenge({
      challengeId: challenge.id,
      publicKey: TEST_PUBLIC_KEY,
      signature,
    });

    await Promise.resolve();
    allowReads = true;

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect([firstResult, secondResult].filter((result) => result.ok)).toHaveLength(1);
    expect([firstResult, secondResult].some((result) => !result.ok && result.code === "replayed")).toBe(true);
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
});
