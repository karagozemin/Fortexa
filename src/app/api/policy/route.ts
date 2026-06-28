import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { jsonWithRequestContext } from "@/lib/observability/http";
import { getRequestLogContext, logError, logInfo, logWarn } from "@/lib/observability/logger";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { readJsonBody } from "@/lib/http/read-json-body";
import { getPolicyConfig, updatePolicyConfig } from "@/lib/storage/policy-store";
import { policyConfigSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const startedAtMs = Date.now();
  const context = getRequestLogContext(request, "/api/policy");
  const auth = requireAuth(request);

  if (!auth.ok) {
    logWarn("Policy read unauthorized", context);
    return auth.response;
  }

  const rate = await consumeRateLimit(request, {
    key: "policy-get",
    limit: 30,
    windowMs: 60_000,
  });

  if (!rate.ok) {
    logWarn("Policy read rate limited", { ...context, userId: auth.session.userId });
    return jsonWithRequestContext(request, {
      route: "/api/policy",
      startedAtMs,
      status: 429,
      body: { error: "Rate limit exceeded for policy read endpoint." },
      headers: rateLimitHeaders(rate),
    });
  }

  const current = await getPolicyConfig();

  logInfo("Policy read success", { ...context, userId: auth.session.userId });

  return jsonWithRequestContext(request, {
    route: "/api/policy",
    startedAtMs,
    status: 200,
    body: current,
    headers: rateLimitHeaders(rate),
  });
}

export async function POST(request: NextRequest) {
  const startedAtMs = Date.now();
  const context = getRequestLogContext(request, "/api/policy");
  const auth = requireAuth(request, { allowedRoles: ["operator"] });

  if (!auth.ok) {
    logWarn("Policy update unauthorized", context);
    return auth.response;
  }

  const rate = await consumeRateLimit(request, {
    key: "policy-update",
    limit: 20,
    windowMs: 60_000,
  });

  if (!rate.ok) {
    logWarn("Policy update rate limited", { ...context, userId: auth.session.userId });
    return jsonWithRequestContext(request, {
      route: "/api/policy",
      startedAtMs,
      status: 429,
      body: { error: "Rate limit exceeded for policy update endpoint." },
      headers: rateLimitHeaders(rate),
    });
  }

  try {
    const bodyResult = await readJsonBody(request);
    if (!bodyResult.ok) {
      logWarn("Policy update payload too large", { ...context, userId: auth.session.userId });
      return jsonWithRequestContext(request, {
        route: "/api/policy",
        startedAtMs,
        status: 413,
        body: { error: bodyResult.error },
        headers: rateLimitHeaders(rate),
      });
    }

    const parsed = policyConfigSchema.safeParse(bodyResult.data);

    if (!parsed.success) {
      logWarn("Policy update validation failed", { ...context, userId: auth.session.userId });
      return jsonWithRequestContext(request, {
        route: "/api/policy",
        startedAtMs,
        status: 400,
        body: { error: "Invalid policy payload.", details: parsed.error.flatten() },
        headers: rateLimitHeaders(rate),
      });
    }

    const updated = await updatePolicyConfig(parsed.data, auth.session.userId);
    logInfo("Policy update success", { ...context, userId: auth.session.userId });
    return jsonWithRequestContext(request, {
      route: "/api/policy",
      startedAtMs,
      status: 200,
      body: updated,
      headers: rateLimitHeaders(rate),
    });
  } catch (error) {
    logError("Policy update internal error", {
      ...context,
      userId: auth.session.userId,
      detail: error instanceof Error ? error.message : "unknown",
    });
    return jsonWithRequestContext(request, {
      route: "/api/policy",
      startedAtMs,
      status: 500,
      body: { error: error instanceof Error ? error.message : "Failed to update policy." },
      headers: rateLimitHeaders(rate),
    });
  }
}
