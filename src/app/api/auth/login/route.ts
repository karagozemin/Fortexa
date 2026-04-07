import { NextRequest } from "next/server";
import { z } from "zod";

import { clearLoginFailures, isLoginLocked, readClientIp, registerLoginFailure } from "@/lib/auth/login-lockout";
import { AUTH_COOKIE_KEY, type AuthRole, createSessionToken } from "@/lib/auth/session";
import { jsonWithRequestContext } from "@/lib/observability/http";
import { getRequestLogContext, logError, logInfo, logWarn } from "@/lib/observability/logger";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4).max(200),
  mfaCode: z.string().min(4).max(20).optional(),
});

function resolveRoleByCredentials(email: string, password: string): AuthRole | null {
  const normalizedEmail = email.trim().toLowerCase();

  const operatorEmail = process.env.FORTEXA_OPERATOR_EMAIL?.trim().toLowerCase();
  const operatorPassword = process.env.FORTEXA_OPERATOR_PASSWORD;

  if (operatorEmail && operatorPassword && normalizedEmail === operatorEmail && password === operatorPassword) {
    return "operator";
  }

  const viewerEmail = process.env.FORTEXA_VIEWER_EMAIL?.trim().toLowerCase();
  const viewerPassword = process.env.FORTEXA_VIEWER_PASSWORD;

  if (viewerEmail && viewerPassword && normalizedEmail === viewerEmail && password === viewerPassword) {
    return "viewer";
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

    const lockState = isLoginLocked(parsed.data.email, clientIp);
    if (lockState.locked) {
      logWarn("Auth login blocked by lockout", { ...context, email: parsed.data.email, ip: clientIp });
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

    const role = resolveRoleByCredentials(parsed.data.email, parsed.data.password);

    if (!role) {
      const failure = registerLoginFailure(parsed.data.email, clientIp);
      logWarn("Auth login invalid credentials", { ...context, email: parsed.data.email });
      return jsonWithRequestContext(request, {
        route: "/api/auth/login",
        startedAtMs,
        status: 401,
        body: {
          error: failure.justLocked
            ? "Invalid credentials. Login temporarily locked due to repeated failures."
            : "Invalid credentials.",
        },
        headers: rateLimitHeaders(rate),
      });
    }

    const requiredMfaCode = process.env.FORTEXA_MFA_CODE?.trim();
    if (requiredMfaCode && parsed.data.mfaCode !== requiredMfaCode) {
      const failure = registerLoginFailure(parsed.data.email, clientIp);
      logWarn("Auth login MFA failed", { ...context, email: parsed.data.email, role });
      return jsonWithRequestContext(request, {
        route: "/api/auth/login",
        startedAtMs,
        status: 401,
        body: {
          error: failure.justLocked
            ? "Invalid MFA code. Login temporarily locked due to repeated failures."
            : "Invalid MFA code.",
        },
        headers: rateLimitHeaders(rate),
      });
    }

    const token = createSessionToken({
      email: parsed.data.email,
      role,
    });

    const response = jsonWithRequestContext(request, {
      route: "/api/auth/login",
      startedAtMs,
      status: 200,
      body: {
        ok: true,
        role,
        email: parsed.data.email,
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

    clearLoginFailures(parsed.data.email, clientIp);

    logInfo("Auth login success", { ...context, email: parsed.data.email, role });

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
