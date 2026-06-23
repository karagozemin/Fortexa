import { NextRequest } from "next/server";
import { z } from "zod";

import { clearLoginFailures, isLoginLocked, readClientIp, registerLoginFailure } from "@/lib/auth/login-lockout";
import { AUTH_COOKIE_KEY, createSessionToken } from "@/lib/auth/session";
import { verifyWalletChallenge } from "@/lib/auth/wallet-challenge";
import { normalizeWalletPublicKey, resolveRoleByWallet } from "@/lib/auth/wallet-role";
import { jsonWithRequestContext } from "@/lib/observability/http";
import { getRequestLogContext, logError, logInfo, logWarn } from "@/lib/observability/logger";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { upsertUserWallet } from "@/lib/storage/user-wallet-store";

const loginSchema = z.object({
  publicKey: z.string().regex(/^G[A-Z2-7]{55}$/u, "Invalid Stellar public key."),
  challengeId: z.string().uuid("Challenge id is required."),
  signature: z.string().min(1, "Wallet signature is required."),
});

function challengeErrorMessage(code: "missing" | "expired" | "replayed" | "wallet_mismatch" | "invalid_signature") {
  switch (code) {
    case "expired":
      return "Login challenge expired. Request a new challenge and sign again.";
    case "replayed":
      return "Login challenge was already used. Request a new challenge and sign again.";
    case "wallet_mismatch":
      return "Challenge does not match the connected wallet.";
    case "invalid_signature":
      return "Wallet signature verification failed.";
    default:
      return "Login challenge is invalid or expired.";
  }
}

export async function POST(request: NextRequest) {
  const startedAtMs = Date.now();
  const context = getRequestLogContext(request, "/api/auth/login");
  const clientIp = readClientIp(request.headers);

  const rate = await consumeRateLimit(request, {
    key: "auth-login",
    limit: 15,
    windowMs: 60_000,
  });

  if (!rate.ok) {
    logWarn("Auth login rate limited", context);
    return jsonWithRequestContext(request, {
      route: "/api/auth/login",
      startedAtMs,
      status: 429,
      body: { error: "Too many login attempts. Try again later." },
      headers: rateLimitHeaders(rate),
    });
  }

  try {
    const rawBody = (await request.json().catch(() => ({}))) as unknown;
    const parsed = loginSchema.safeParse(rawBody);

    if (!parsed.success) {
      logWarn("Auth login validation failed", context);
      return jsonWithRequestContext(request, {
        route: "/api/auth/login",
        startedAtMs,
        status: 400,
        body: { error: "Invalid login payload.", details: parsed.error.flatten() },
        headers: rateLimitHeaders(rate),
      });
    }

    const normalizedWallet = normalizeWalletPublicKey(parsed.data.publicKey);

    const lockState = await isLoginLocked(normalizedWallet, clientIp);
    if (lockState.locked) {
      logWarn("Auth login blocked by lockout", { ...context, wallet: normalizedWallet, ip: clientIp });
      return jsonWithRequestContext(request, {
        route: "/api/auth/login",
        startedAtMs,
        status: 423,
        body: {
          error: "Account login is temporarily locked due to failed attempts.",
          retryAfterSeconds: lockState.retryAfterSeconds,
        },
        headers: {
          ...rateLimitHeaders(rate),
          "Retry-After": String(lockState.retryAfterSeconds),
        },
      });
    }

    const challengeResult = await verifyWalletChallenge({
      challengeId: parsed.data.challengeId,
      publicKey: normalizedWallet,
      signature: parsed.data.signature,
    });

    if (!challengeResult.ok) {
      const countsAsFailure = challengeResult.code === "invalid_signature";
      const failure = countsAsFailure ? await registerLoginFailure(normalizedWallet, clientIp) : null;

      logWarn("Auth login challenge verification failed", {
        ...context,
        wallet: normalizedWallet,
        code: challengeResult.code,
      });

      return jsonWithRequestContext(request, {
        route: "/api/auth/login",
        startedAtMs,
        status: challengeResult.code === "invalid_signature" ? 401 : 400,
        body: {
          error: failure?.justLocked
            ? `${challengeErrorMessage(challengeResult.code)} Login temporarily locked due to repeated failures.`
            : challengeErrorMessage(challengeResult.code),
          retryAfterSeconds: failure?.justLocked
            ? Math.max(1, Math.ceil((failure.lockedUntilMs - Date.now()) / 1000))
            : undefined,
        },
        headers: rateLimitHeaders(rate),
      });
    }

    const role = resolveRoleByWallet(normalizedWallet);

    if (!role) {
      const failure = await registerLoginFailure(normalizedWallet, clientIp);
      logWarn("Auth login unknown wallet", { ...context, wallet: normalizedWallet });
      return jsonWithRequestContext(request, {
        route: "/api/auth/login",
        startedAtMs,
        status: 401,
        body: {
          error: failure.justLocked
            ? "Wallet is not authorized. Login temporarily locked due to repeated failures."
            : "Wallet is not authorized.",
        },
        headers: rateLimitHeaders(rate),
      });
    }

    const userId = `wallet:${normalizedWallet}`;

    await upsertUserWallet(userId, {
      publicKey: normalizedWallet,
      source: "external",
      provider: "login",
    });

    const token = createSessionToken({
      email: `wallet:${normalizedWallet}`,
      role,
      userId,
    });

    const response = jsonWithRequestContext(request, {
      route: "/api/auth/login",
      startedAtMs,
      status: 200,
      body: {
        ok: true,
        role,
        wallet: normalizedWallet,
      },
      headers: rateLimitHeaders(rate),
    });

    response.cookies.set(AUTH_COOKIE_KEY, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    await clearLoginFailures(normalizedWallet, clientIp);

    logInfo("Auth login success", { ...context, wallet: normalizedWallet, role });

    return response;
  } catch (error) {
    logError("Auth login internal error", {
      ...context,
      detail: error instanceof Error ? error.message : "unknown",
    });
    return jsonWithRequestContext(request, {
      route: "/api/auth/login",
      startedAtMs,
      status: 500,
      body: { error: error instanceof Error ? error.message : "Login failed." },
      headers: rateLimitHeaders(rate),
    });
  }
}
