import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { evaluateDecision } from "@/lib/decision/engine";
import { jsonWithRequestContext } from "@/lib/observability/http";
import { getRequestLogContext, logError, logInfo, logWarn } from "@/lib/observability/logger";
import { demoScenarios } from "@/lib/scenarios/seed";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { appendAuditEntry, consumeUsage, getDailyUsage } from "@/lib/storage/audit-store";
import { getPolicyConfig } from "@/lib/storage/policy-store";
import type { AgentAction } from "@/lib/types/domain";
import { decisionRequestSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  const startedAtMs = Date.now();
  const context = getRequestLogContext(request, "/api/decision");

  const rate = consumeRateLimit(request, {
    key: "decision",
    limit: 40,
    windowMs: 60_000,
  });

  if (!rate.ok) {
    logWarn("Decision route rate limited", context);
    return jsonWithRequestContext(request, {
      route: "/api/decision",
      startedAtMs,
      status: 429,
      body: { error: "Rate limit exceeded for decision endpoint." },
      headers: rateLimitHeaders(rate),
    });
  }

  try {
    const auth = requireAuth(request, { allowedRoles: ["operator"] });

    if (!auth.ok) {
      logWarn("Decision route unauthorized", context);
      return auth.response;
    }

    const userId = auth.session.userId;

    const rawBody = (await request.json().catch(() => ({}))) as unknown;
    const parsedBody = decisionRequestSchema.safeParse(rawBody);

    if (!parsedBody.success) {
      logWarn("Decision route validation failed", { ...context, userId });
      return jsonWithRequestContext(request, {
        route: "/api/decision",
        startedAtMs,
        status: 400,
        body: {
          error: "Invalid decision request body.",
          details: parsedBody.error.flatten(),
        },
        headers: rateLimitHeaders(rate),
      });
    }

    const body = parsedBody.data as {
      scenarioId?: string;
      action?: AgentAction;
      approvedByHuman?: boolean;
    };

    const scenarioAction = body.scenarioId
      ? demoScenarios.find((scenario) => scenario.id === body.scenarioId)?.action
      : undefined;

    const action = body.action ?? scenarioAction;

    if (!action) {
      logWarn("Decision route action missing", { ...context, userId });
      return jsonWithRequestContext(request, {
        route: "/api/decision",
        startedAtMs,
        status: 400,
        body: { error: "No action provided." },
        headers: rateLimitHeaders(rate),
      });
    }

    const { policy } = await getPolicyConfig();
    const usage = await getDailyUsage(userId);
    const decision = evaluateDecision(action, policy, usage);

    let finalDecision = decision.decision;
    let explanation = decision.explanation;

    if (decision.decision === "REQUIRE_APPROVAL" && body.approvedByHuman) {
      finalDecision = "APPROVE";
      explanation = "Manual operator approval granted. Action moved from REQUIRE_APPROVAL to APPROVE.";
    }

    if (finalDecision === "APPROVE" || finalDecision === "WARN") {
      await consumeUsage(userId, action.amountXLM);
    }

    const auditEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      decision: finalDecision,
      explanation,
      triggeredPolicies: decision.triggeredPolicies.map((policy) => `${policy.code}: ${policy.message}`),
      riskFindings: decision.riskFindings.map((finding) => `${finding.code}: ${finding.detail}`),
    };

    await appendAuditEntry(userId, auditEntry);

    const latestUsage = await getDailyUsage(userId);

    logInfo("Decision evaluated", {
      ...context,
      userId,
      decision: finalDecision,
      riskScore: decision.riskScore,
    });

    return jsonWithRequestContext(request, {
      route: "/api/decision",
      startedAtMs,
      status: 200,
      body: {
        result: {
          ...decision,
          decision: finalDecision,
          explanation,
        },
        auditEntry,
        usage: latestUsage,
        userId,
      },
      headers: rateLimitHeaders(rate),
    });
  } catch (error) {
    logError("Decision route internal error", {
      ...context,
      detail: error instanceof Error ? error.message : "unknown",
    });
    return jsonWithRequestContext(request, {
      route: "/api/decision",
      startedAtMs,
      status: 500,
      body: { error: error instanceof Error ? error.message : "Unexpected decision failure." },
      headers: rateLimitHeaders(rate),
    });
  }
}
