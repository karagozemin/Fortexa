import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getOrCreateUserId, USER_COOKIE_KEY } from "@/lib/auth/user-id";
import { evaluateDecision } from "@/lib/decision/engine";
import { defaultPolicyConfig } from "@/lib/policy/engine";
import { demoScenarios } from "@/lib/scenarios/seed";
import { appendAuditEntry, consumeUsage, getDailyUsage } from "@/lib/storage/audit-store";
import type { AgentAction } from "@/lib/types/domain";

export async function POST(request: NextRequest) {
  try {
    const { userId, shouldSetCookie } = getOrCreateUserId(request);

    const body = (await request.json()) as {
      scenarioId?: string;
      action?: AgentAction;
      approvedByHuman?: boolean;
    };

    const scenarioAction = body.scenarioId
      ? demoScenarios.find((scenario) => scenario.id === body.scenarioId)?.action
      : undefined;

    const action = body.action ?? scenarioAction;

    if (!action) {
      return NextResponse.json({ error: "No action provided." }, { status: 400 });
    }

    const usage = await getDailyUsage(userId);
    const decision = evaluateDecision(action, defaultPolicyConfig, usage);

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

    const response = NextResponse.json({
      result: {
        ...decision,
        decision: finalDecision,
        explanation,
      },
      auditEntry,
      usage: latestUsage,
      userId,
    });

    if (shouldSetCookie) {
      response.cookies.set(USER_COOKIE_KEY, userId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected decision failure." },
      { status: 500 }
    );
  }
}
