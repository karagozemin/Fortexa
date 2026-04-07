import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { evaluateDecision } from "@/lib/decision/engine";
import { defaultPolicyConfig } from "@/lib/policy/engine";
import { demoScenarios } from "@/lib/scenarios/seed";
import { appendAuditEntry, consumeUsage, getDailyUsage } from "@/lib/storage/audit-store";
import type { AgentAction } from "@/lib/types/domain";

export async function POST(request: Request) {
  try {
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

    const usage = getDailyUsage();
    const decision = evaluateDecision(action, defaultPolicyConfig, usage);

    let finalDecision = decision.decision;
    let explanation = decision.explanation;

    if (decision.decision === "REQUIRE_APPROVAL" && body.approvedByHuman) {
      finalDecision = "APPROVE";
      explanation = "Manual operator approval granted. Action moved from REQUIRE_APPROVAL to APPROVE.";
    }

    if (finalDecision === "APPROVE" || finalDecision === "WARN") {
      consumeUsage(action.amountXLM);
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

    appendAuditEntry(auditEntry);

    return NextResponse.json({
      result: {
        ...decision,
        decision: finalDecision,
        explanation,
      },
      auditEntry,
      usage: getDailyUsage(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected decision failure." },
      { status: 500 }
    );
  }
}
