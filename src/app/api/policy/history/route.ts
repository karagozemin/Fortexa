import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { jsonWithRequestContext } from "@/lib/observability/http";
import { getRequestLogContext, logError, logInfo, logWarn } from "@/lib/observability/logger";
import { getPolicyHistory } from "@/lib/storage/policy-store";

export async function GET(request: NextRequest) {
  const startedAtMs = Date.now();
  const context = getRequestLogContext(request, "/api/policy/history");
  const auth = requireAuth(request, { allowedRoles: ["operator"] });

  if (!auth.ok) {
    logWarn("Policy history unauthorized", context);
    return auth.response;
  }

  try {
    const limitRaw = request.nextUrl.searchParams.get("limit");
    const limit = limitRaw ? Math.min(200, Math.max(1, Number(limitRaw))) : 20;
    const entries = await getPolicyHistory(limit);

    logInfo("Policy history read", { ...context, userId: auth.session.userId, count: entries.length });

    return jsonWithRequestContext(request, {
      route: "/api/policy/history",
      startedAtMs,
      status: 200,
      body: { entries },
    });
  } catch (error) {
    logError("Policy history internal error", {
      ...context,
      userId: auth.session.userId,
      detail: error instanceof Error ? error.message : "unknown",
    });

    return jsonWithRequestContext(request, {
      route: "/api/policy/history",
      startedAtMs,
      status: 500,
      body: { error: error instanceof Error ? error.message : "Failed to read policy history." },
    });
  }
}
