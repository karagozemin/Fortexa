import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { getRequestLogContext, logError, logInfo, logWarn } from "@/lib/observability/logger";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { getPolicyConfig, updatePolicyConfig } from "@/lib/storage/policy-store";
import { policyConfigSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const context = getRequestLogContext(request, "/api/policy");
  const auth = requireAuth(request);

  if (!auth.ok) {
    logWarn("Policy read unauthorized", context);
    return auth.response;
  }

  const rate = consumeRateLimit(request, {
    key: "policy-get",
    limit: 30,
    windowMs: 60_000,
  });

  if (!rate.ok) {
    logWarn("Policy read rate limited", { ...context, userId: auth.session.userId });
    return NextResponse.json(
      { error: "Rate limit exceeded for policy read endpoint." },
      { status: 429, headers: rateLimitHeaders(rate) }
    );
  }

  const current = await getPolicyConfig();

  logInfo("Policy read success", { ...context, userId: auth.session.userId });

  return NextResponse.json(current, { headers: rateLimitHeaders(rate) });
}

export async function POST(request: NextRequest) {
  const context = getRequestLogContext(request, "/api/policy");
  const auth = requireAuth(request, { allowedRoles: ["operator"] });

  if (!auth.ok) {
    logWarn("Policy update unauthorized", context);
    return auth.response;
  }

  const rate = consumeRateLimit(request, {
    key: "policy-update",
    limit: 20,
    windowMs: 60_000,
  });

  if (!rate.ok) {
    logWarn("Policy update rate limited", { ...context, userId: auth.session.userId });
    return NextResponse.json(
      { error: "Rate limit exceeded for policy update endpoint." },
      { status: 429, headers: rateLimitHeaders(rate) }
    );
  }

  try {
    const rawBody = (await request.json().catch(() => ({}))) as unknown;
    const parsed = policyConfigSchema.safeParse(rawBody);

    if (!parsed.success) {
      logWarn("Policy update validation failed", { ...context, userId: auth.session.userId });
      return NextResponse.json(
        { error: "Invalid policy payload.", details: parsed.error.flatten() },
        { status: 400, headers: rateLimitHeaders(rate) }
      );
    }

    const updated = await updatePolicyConfig(parsed.data);
    logInfo("Policy update success", { ...context, userId: auth.session.userId });
    return NextResponse.json(updated, { headers: rateLimitHeaders(rate) });
  } catch (error) {
    logError("Policy update internal error", {
      ...context,
      userId: auth.session.userId,
      detail: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update policy." },
      { status: 500, headers: rateLimitHeaders(rate) }
    );
  }
}
