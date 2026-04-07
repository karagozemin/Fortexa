import { NextRequest } from "next/server";
import { z } from "zod";

import { clearLoginFailures, isLoginLocked, readClientIp, registerLoginFailure } from "@/lib/auth/login-lockout";
import { AUTH_COOKIE_KEY, type AuthRole, createSessionToken } from "@/lib/auth/session";
import { jsonWithRequestContext } from "@/lib/observability/http";
import { getRequestLogContext, logError, logInfo, logWarn } from "@/lib/observability/logger";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { upsertUserWallet } from "@/lib/storage/user-wallet-store";

const loginSchema = z.object({
  publicKey: z.string().regex(/^G[A-Z2-7]{55}$/u, "Invalid Stellar public key."),
});

function parseWalletList(value: string | undefined) {
  if (!value?.trim()) {
    return new Set<string>();
  }

  return new Set(
    value
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter((item) => /^G[A-Z2-7]{55}$/u.test(item))
  );
}

function resolveRoleByWallet(publicKey: string): AuthRole | null {
  const normalizedKey = publicKey.trim().toUpperCase();

  const operatorWallets = parseWalletList(process.env.FORTEXA_OPERATOR_WALLETS);
  const viewerWallets = parseWalletList(process.env.FORTEXA_VIEWER_WALLETS);

  if (operatorWallets.has(normalizedKey)) {
    return "operator";
  }

  if (viewerWallets.has(normalizedKey)) {
    return "viewer";
  }

  if (operatorWallets.size === 0 && viewerWallets.size === 0) {
    return "operator";
  }

  return null;
}

export async function POST(request: NextRequest) {
  const startedAtMs = Date.now();
  const context = getRequestLogContext(request, "/api/auth/login");
  const clientIp = readClientIp(request.headers);

  const rate = consumeRateLimit(request, {
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

    const lockState = isLoginLocked(parsed.data.publicKey, clientIp);
    if (lockState.locked) {
      logWarn("Auth login blocked by lockout", { ...context, wallet: parsed.data.publicKey, ip: clientIp });
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

    const role = resolveRoleByWallet(parsed.data.publicKey);

    if (!role) {
      const failure = registerLoginFailure(parsed.data.publicKey, clientIp);
      logWarn("Auth login unknown wallet", { ...context, wallet: parsed.data.publicKey });
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

    const normalizedWallet = parsed.data.publicKey.trim().toUpperCase();
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

    clearLoginFailures(normalizedWallet, clientIp);

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
