import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import {
  DEFAULT_AUDIT_SAMPLE_SIZE,
  auditSampleCases,
  scenarioCases,
  simulatePolicyChange,
} from "@/lib/decision/simulate";
import { jsonWithRequestContext } from "@/lib/observability/http";
import { getRequestLogContext, logError, logInfo, logWarn } from "@/lib/observability/logger";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { getDailyUsage, listAuditEntries } from "@/lib/storage/audit-store";
import { getPolicyConfig } from "@/lib/storage/policy-store";
import { policySimulateRequestSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  const startedAtMs = Date.now();
  const context = getRequestLogContext(request, "/api/policy/simulate");
  const auth = requireAuth(request, { allowedRoles: ["operator"] });

  if (!auth.ok) {
    logWarn("Policy simulate unauthorized", context);
    return auth.response;
  }

  const rate = await consumeRateLimit(request, {
    key: "policy-simulate",
    limit: 20,
    windowMs: 60_000,
  });

  if (!rate.ok) {
    logWarn("Policy simulate rate limited", { ...context, userId: auth.session.userId });
    return jsonWithRequestContext(request, {
      route: "/api/policy/simulate",
      startedAtMs,
      status: 429,
      body: { error: "Rate limit exceeded for policy simulate endpoint." },
      headers: rateLimitHeaders(rate),
    });
  }

  try {
    const userId = auth.session.userId;

    const rawBody = (await request.json().catch(() => ({}))) as unknown;
    const parsed = policySimulateRequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      logWarn("Policy simulate validation failed", { ...context, userId });
      return jsonWithRequestContext(request, {
        route: "/api/policy/simulate",
        startedAtMs,
        status: 400,
        body: { error: "Invalid simulation payload.", details: parsed.error.flatten() },
        headers: rateLimitHeaders(rate),
      });
    }

    const { policy: proposedPolicy, includeAudit, auditSampleSize } = parsed.data;

    // Read-only snapshots. Nothing below mutates policy or usage state.
    const { policy: currentPolicy } = await getPolicyConfig();
    const usage = await getDailyUsage(userId);

    const cases = scenarioCases();
    let auditSampled = 0;

    if (includeAudit) {
      const entries = await listAuditEntries(userId);
      const auditCases = auditSampleCases(entries, auditSampleSize ?? DEFAULT_AUDIT_SAMPLE_SIZE);
      auditSampled = auditCases.length;
      cases.push(...auditCases);
    }

    const report = await simulatePolicyChange({
      currentPolicy,
      proposedPolicy,
      cases,
      usage,
    });

    logInfo("Policy simulation evaluated", {
      ...context,
      userId,
      total: report.summary.total,
      changed: report.summary.changed,
      auditSampled,
    });

    return jsonWithRequestContext(request, {
      route: "/api/policy/simulate",
      startedAtMs,
      status: 200,
      body: {
        report,
        auditSampled,
        usage,
        userId,
      },
      headers: rateLimitHeaders(rate),
    });
  } catch (error) {
    logError("Policy simulate internal error", {
      ...context,
      userId: auth.session.userId,
      detail: error instanceof Error ? error.message : "unknown",
    });
    return jsonWithRequestContext(request, {
      route: "/api/policy/simulate",
      startedAtMs,
      status: 500,
      body: { error: error instanceof Error ? error.message : "Failed to simulate policy." },
      headers: rateLimitHeaders(rate),
    });
  }
}
