import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { evaluateDecision } from "@/lib/decision/engine";
import { defaultPolicyConfig } from "@/lib/policy/engine";
import { demoScenarios } from "@/lib/scenarios/seed";
import { sendPayment } from "@/lib/stellar/client";
import { appendAuditEntry, consumeUsage, getDailyUsage, resetAuditState } from "@/lib/storage/audit-store";

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as { destination?: string };

    resetAuditState();

    const runSummary: Array<{
      scenarioId: string;
      title: string;
      decision: string;
      explanation: string;
      stellarTxHash?: string;
    }> = [];

    for (const scenario of demoScenarios) {
      const usage = getDailyUsage();
      const decision = evaluateDecision(scenario.action, defaultPolicyConfig, usage);

      let finalDecision = decision.decision;
      let explanation = decision.explanation;
      let stellarTxHash: string | undefined;

      if (scenario.id === "manual-approval-needed" && decision.decision === "REQUIRE_APPROVAL") {
        appendAuditEntry({
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          action: scenario.action,
          decision: decision.decision,
          explanation: decision.explanation,
          triggeredPolicies: decision.triggeredPolicies.map((item) => `${item.code}: ${item.message}`),
          riskFindings: decision.riskFindings.map((item) => `${item.code}: ${item.detail}`),
        });

        finalDecision = "APPROVE";
        explanation = "Demo mode: operator manually approved this high-value action.";
      }

      if (finalDecision === "APPROVE" || finalDecision === "WARN") {
        consumeUsage(scenario.action.amountXLM);
      }

      if (scenario.id === "safe-research-payment" && (finalDecision === "APPROVE" || finalDecision === "WARN") && payload.destination) {
        const payment = await sendPayment({
          destination: payload.destination,
          amountXLM: scenario.action.amountXLM.toFixed(7),
          memo: `fortexa:demo:${scenario.id}`,
        });
        stellarTxHash = payment.hash;
      }

      appendAuditEntry({
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        action: scenario.action,
        decision: finalDecision,
        explanation,
        triggeredPolicies: decision.triggeredPolicies.map((item) => `${item.code}: ${item.message}`),
        riskFindings: decision.riskFindings.map((item) => `${item.code}: ${item.detail}`),
        stellarTxHash,
      });

      runSummary.push({
        scenarioId: scenario.id,
        title: scenario.title,
        decision: finalDecision,
        explanation,
        stellarTxHash,
      });
    }

    return NextResponse.json({
      ok: true,
      summary: runSummary,
      usage: getDailyUsage(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Demo mode failed." },
      { status: 500 }
    );
  }
}
