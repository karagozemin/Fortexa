import { evaluatePolicy } from "@/lib/policy/engine";
import { evaluateSecurity } from "@/lib/security/analyzer";
import type {
  AgentAction,
  DailyUsage,
  DecisionResult,
  PolicyConfig,
} from "@/lib/types/domain";

function decideExplanation(result: DecisionResult): string {
  if (result.decision === "BLOCK") {
    return "Fortexa blocked this action because policy and security controls indicate a materially unsafe payment/tool operation.";
  }

  if (result.decision === "REQUIRE_APPROVAL") {
    return "Fortexa flagged this as high impact. Manual approval is required before economic execution.";
  }

  if (result.decision === "WARN") {
    return "Fortexa allows this action with caution. Risk signals were detected and logged for operator review.";
  }

  return "Fortexa approved this action. Policy checks and risk analysis are within trusted operating bounds.";
}

export async function evaluateDecision(
  action: AgentAction,
  policy: PolicyConfig,
  usage: DailyUsage,
): Promise<DecisionResult> {
  const policyResult = evaluatePolicy(action, policy, usage);
  const security = await evaluateSecurity(action);

  const severeSecurityFinding = security.findings.some(
    (finding) => finding.severity === "high",
  );
  const mediumSecurityFinding = security.findings.some(
    (finding) => finding.severity === "medium",
  );

  let decision: DecisionResult["decision"] = "APPROVE";

  if (policyResult.hardBlock || severeSecurityFinding) {
    decision = "BLOCK";
  } else if (
    policyResult.requireApproval ||
    security.riskScore >= policy.riskThreshold
  ) {
    decision = "REQUIRE_APPROVAL";
  } else if (policyResult.warning || mediumSecurityFinding) {
    decision = "WARN";
  }

  // If analyzer is degraded (timeout or error), escalate decision conservatively:
  // - APPROVE -> WARN (alert operator to degraded state)
  // - WARN -> REQUIRE_APPROVAL (be more protective)
  // - REQUIRE_APPROVAL/BLOCK -> stay same (already conservative)
  if (security.analyzerStatus.isDegraded) {
    if (decision === "APPROVE") {
      decision = "WARN";
    } else if (decision === "WARN") {
      decision = "REQUIRE_APPROVAL";
    }
  }

  const result: DecisionResult = {
    decision,
    explanation: "",
    triggeredPolicies: policyResult.triggers,
    riskScore: security.riskScore,
    riskFindings: security.findings,
    requiresManualApproval: decision === "REQUIRE_APPROVAL",
    analyzerStatus: security.analyzerStatus,
  };

  result.explanation = decideExplanation(result);

  return result;
}
