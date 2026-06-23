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
});
