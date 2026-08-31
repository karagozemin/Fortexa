import { Keypair } from "@stellar/stellar-sdk";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_COOKIE_KEY } from "@/lib/auth/session";
import { hashSep53Message, resetWalletChallengeStore } from "@/lib/auth/wallet-challenge";
import { resetLoginLockoutStore } from "@/lib/auth/login-lockout";
import { POST as createChallenge } from "@/app/api/auth/challenge/route";
import { POST as login } from "@/app/api/auth/login/route";

const AUTHORIZED_SECRET = "SAKICEVQLYWGSOJS4WW7HZJWAHZVEEBS527LHK5V4MLJALYKICQCJXMW";
const AUTHORIZED_PUBLIC_KEY = "GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L";

function signSep53Message(secret: string, message: string) {
  const keypair = Keypair.fromSecret(secret);
  return keypair.sign(hashSep53Message(message)).toString("base64");
}

async function issueChallenge(publicKey: string) {
  const request = new NextRequest("http://localhost/api/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ publicKey }),
  });

  const response = await createChallenge(request);
  expect(response.status).toBe(200);

  return (await response.json()) as {
    challengeId: string;
    message: string;
    expiresAt: string;
  };
}

describe("/api/auth/login challenge-signature flow", () => {
  beforeEach(async () => {
    await resetWalletChallengeStore();
  });

  afterEach(async () => {
    vi.useRealTimers();
    delete process.env.FORTEXA_OPERATOR_WALLETS;
    delete process.env.FORTEXA_VIEWER_WALLETS;
    delete process.env.FORTEXA_AUTH_CHALLENGE_TTL_SECONDS;
    delete process.env.FORTEXA_AUTH_MAX_ATTEMPTS;
    await resetWalletChallengeStore();
    await resetLoginLockoutStore();
  });

  it("issues a session cookie after a valid wallet signature", async () => {
    process.env.FORTEXA_AUTH_SECRET = "login-route-test-secret";
    process.env.FORTEXA_OPERATOR_WALLETS = AUTHORIZED_PUBLIC_KEY;

    const challenge = await issueChallenge(AUTHORIZED_PUBLIC_KEY);
    const signature = signSep53Message(AUTHORIZED_SECRET, challenge.message);

    const request = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        publicKey: AUTHORIZED_PUBLIC_KEY,
        challengeId: challenge.challengeId,
        signature,
      }),
    });

    const response = await login(request);
    expect(response.status).toBe(200);

    const payload = (await response.json()) as { ok: boolean; role: string; wallet: string };
    expect(payload.ok).toBe(true);
    expect(payload.role).toBe("operator");
    expect(payload.wallet).toBe(AUTHORIZED_PUBLIC_KEY);
    expect(response.cookies.get(AUTH_COOKIE_KEY)?.value).toBeTruthy();
  });

  it("rejects replayed challenges", async () => {
    process.env.FORTEXA_AUTH_SECRET = "login-route-test-secret";
    process.env.FORTEXA_OPERATOR_WALLETS = AUTHORIZED_PUBLIC_KEY;

    const challenge = await issueChallenge(AUTHORIZED_PUBLIC_KEY);
    const signature = signSep53Message(AUTHORIZED_SECRET, challenge.message);

    const body = JSON.stringify({
      publicKey: AUTHORIZED_PUBLIC_KEY,
      challengeId: challenge.challengeId,
      signature,
    });

    const first = await login(
      new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      })
    );
    expect(first.status).toBe(200);

    const second = await login(
      new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      })
    );

    expect(second.status).toBe(400);
    const payload = (await second.json()) as { error: string };
    expect(payload.error).toContain("already used");
  });

  it("rejects expired challenges", async () => {
    vi.useFakeTimers();
    process.env.FORTEXA_AUTH_SECRET = "login-route-test-secret";
    process.env.FORTEXA_OPERATOR_WALLETS = AUTHORIZED_PUBLIC_KEY;
    process.env.FORTEXA_AUTH_CHALLENGE_TTL_SECONDS = "60";

    const challenge = await issueChallenge(AUTHORIZED_PUBLIC_KEY);
    const signature = signSep53Message(AUTHORIZED_SECRET, challenge.message);

    vi.advanceTimersByTime(61_000);

    const response = await login(
      new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          publicKey: AUTHORIZED_PUBLIC_KEY,
          challengeId: challenge.challengeId,
          signature,
        }),
      })
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("expired");
  });

  it("rejects unauthorized wallets after signature verification", async () => {
    process.env.FORTEXA_AUTH_SECRET = "login-route-test-secret";
    process.env.FORTEXA_OPERATOR_WALLETS = AUTHORIZED_PUBLIC_KEY;

    const unauthorized = Keypair.random();
    const challenge = await issueChallenge(unauthorized.publicKey());
    const signature = signSep53Message(unauthorized.secret(), challenge.message);

    const response = await login(
      new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          publicKey: unauthorized.publicKey(),
          challengeId: challenge.challengeId,
          signature,
        }),
      })
    );

    expect(response.status).toBe(401);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("not authorized");
  });
  describe("expiry at the request boundary", () => {
    // The route must refuse an expired challenge before it resolves a role,
    // touches the wallet store, or mints a session. `expiresAt` is inclusive:
    // the stated instant is already too late.
    it("rejects a challenge at the exact expiry instant", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      process.env.FORTEXA_AUTH_SECRET = "login-route-test-secret";
      process.env.FORTEXA_OPERATOR_WALLETS = AUTHORIZED_PUBLIC_KEY;
      process.env.FORTEXA_AUTH_CHALLENGE_TTL_SECONDS = "60";

      const challenge = await issueChallenge(AUTHORIZED_PUBLIC_KEY);
      const signature = signSep53Message(AUTHORIZED_SECRET, challenge.message);

      vi.setSystemTime(Date.parse(challenge.expiresAt));

      const response = await login(
        new NextRequest("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            publicKey: AUTHORIZED_PUBLIC_KEY,
            challengeId: challenge.challengeId,
            signature,
          }),
        })
      );

      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: string };
      expect(payload.error).toContain("expired");
      expect(response.cookies.get(AUTH_COOKIE_KEY)).toBeUndefined();
    });

    it("accepts a challenge one millisecond before expiry", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      process.env.FORTEXA_AUTH_SECRET = "login-route-test-secret";
      process.env.FORTEXA_OPERATOR_WALLETS = AUTHORIZED_PUBLIC_KEY;
      process.env.FORTEXA_AUTH_CHALLENGE_TTL_SECONDS = "60";

      const challenge = await issueChallenge(AUTHORIZED_PUBLIC_KEY);
      const signature = signSep53Message(AUTHORIZED_SECRET, challenge.message);

      vi.setSystemTime(Date.parse(challenge.expiresAt) - 1);

      const response = await login(
        new NextRequest("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            publicKey: AUTHORIZED_PUBLIC_KEY,
            challengeId: challenge.challengeId,
            signature,
          }),
        })
      );

      expect(response.status).toBe(200);
      expect(response.cookies.get(AUTH_COOKIE_KEY)?.value).toBeTruthy();
    });

    it("does not spend lockout budget on expired challenges", async () => {
      // An expired challenge is a timing failure, not a credential failure:
      // letting it count toward lockout would let anyone lock a wallet out by
      // sitting on the login screen.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      process.env.FORTEXA_AUTH_SECRET = "login-route-test-secret";
      process.env.FORTEXA_OPERATOR_WALLETS = AUTHORIZED_PUBLIC_KEY;
      process.env.FORTEXA_AUTH_CHALLENGE_TTL_SECONDS = "60";
      process.env.FORTEXA_AUTH_MAX_ATTEMPTS = "2";

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const stale = await issueChallenge(AUTHORIZED_PUBLIC_KEY);
        const staleSignature = signSep53Message(AUTHORIZED_SECRET, stale.message);
        vi.setSystemTime(Date.parse(stale.expiresAt));

        const rejected = await login(
          new NextRequest("http://localhost/api/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              publicKey: AUTHORIZED_PUBLIC_KEY,
              challengeId: stale.challengeId,
              signature: staleSignature,
            }),
          })
        );

        expect(rejected.status).toBe(400);
      }

      const fresh = await issueChallenge(AUTHORIZED_PUBLIC_KEY);
      const response = await login(
        new NextRequest("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            publicKey: AUTHORIZED_PUBLIC_KEY,
            challengeId: fresh.challengeId,
            signature: signSep53Message(AUTHORIZED_SECRET, fresh.message),
          }),
        })
      );

      expect(response.status).toBe(200);
    });
  });
});
