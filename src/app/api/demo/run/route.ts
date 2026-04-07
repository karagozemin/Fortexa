import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getOrCreateUserId, USER_COOKIE_KEY } from "@/lib/auth/user-id";
import { evaluateDecision } from "@/lib/decision/engine";
import { defaultPolicyConfig } from "@/lib/policy/engine";
import { demoScenarios } from "@/lib/scenarios/seed";
import { executePaymentForUser } from "@/lib/stellar/execute-user-payment";
import { appendAuditEntry, consumeUsage, getDailyUsage, resetAuditState } from "@/lib/storage/audit-store";

export async function POST(request: NextRequest) {
  try {
    const { userId, shouldSetCookie } = getOrCreateUserId(request);
    const payload = (await request.json().catch(() => ({}))) as { destination?: string };

    await resetAuditState(userId);

    const runSummary: Array<{
      scenarioId: string;
      title: string;
      decision: string;
      explanation: string;
      stellarTxHash?: string;
    }> = [];

    for (const scenario of demoScenarios) {
      const usage = await getDailyUsage(userId);
      const decision = evaluateDecision(scenario.action, defaultPolicyConfig, usage);

      let finalDecision = decision.decision;
      let explanation = decision.explanation;
      let stellarTxHash: string | undefined;

      if (scenario.id === "manual-approval-needed" && decision.decision === "REQUIRE_APPROVAL") {
        await appendAuditEntry(userId, {
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
        await consumeUsage(userId, scenario.action.amountXLM);
      }

      if (scenario.id === "safe-research-payment" && (finalDecision === "APPROVE" || finalDecision === "WARN") && payload.destination) {
        const paymentResult = await executePaymentForUser(userId, {
          destination: payload.destination,
          amountXLM: scenario.action.amountXLM.toFixed(7),
          memo: `fortexa:demo:${scenario.id}`,
        });
        stellarTxHash = paymentResult.payment.hash;

        if (paymentResult.isFreighterNonCustodial) {
          explanation = `${explanation} Demo mode used shared payment pipeline; Freighter-linked wallets require interactive extension signing for a real on-chain submit.`;
        }
      }

      await appendAuditEntry(userId, {
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

    const latestUsage = await getDailyUsage(userId);

    const response = NextResponse.json({
      ok: true,
      userId,
      summary: runSummary,
      usage: latestUsage,
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
      { error: error instanceof Error ? error.message : "Demo mode failed." },
      { status: 500 }
    );
  }
}
