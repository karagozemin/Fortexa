import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { jsonWithRequestContext } from "@/lib/observability/http";
import { getRequestLogContext, logError, logInfo, logWarn } from "@/lib/observability/logger";
import { rollbackPolicyVersion } from "@/lib/storage/policy-store";
import { policyRollbackSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  const startedAtMs = Date.now();
  const context = getRequestLogContext(request, "/api/policy/rollback");
  const auth = requireAuth(request, { allowedRoles: ["operator"] });

  if (!auth.ok) {
    logWarn("Policy rollback unauthorized", context);
    return auth.response;
  }

  try {
    const rawBody = (await request.json().catch(() => ({}))) as unknown;
    const parsed = policyRollbackSchema.safeParse(rawBody);

    if (!parsed.success) {
      return jsonWithRequestContext(request, {
        route: "/api/policy/rollback",
        startedAtMs,
        status: 400,
        body: { error: "Invalid rollback payload.", details: parsed.error.flatten() },
      });
    }

    const rolled = await rollbackPolicyVersion(parsed.data.targetVersion, auth.session.userId);

    logInfo("Policy rollback success", {
      ...context,
      userId: auth.session.userId,
      targetVersion: parsed.data.targetVersion,
      version: rolled.version,
    });

    return jsonWithRequestContext(request, {
      route: "/api/policy/rollback",
      startedAtMs,
      status: 200,
      body: rolled,
    });
  } catch (error) {
    logError("Policy rollback internal error", {
      ...context,
      userId: auth.session.userId,
      detail: error instanceof Error ? error.message : "unknown",
    });

    return jsonWithRequestContext(request, {
      route: "/api/policy/rollback",
      startedAtMs,
      status: 500,
      body: { error: error instanceof Error ? error.message : "Failed to rollback policy." },
    });
  }
}
