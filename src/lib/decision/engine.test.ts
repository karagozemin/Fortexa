import { describe, expect, it } from "vitest";

import { evaluateDecision } from "@/lib/decision/engine";
import { defaultPolicyConfig } from "@/lib/policy/engine";
import { demoScenarios, defaultDailyUsage } from "@/lib/scenarios/seed";
import type { AgentAction, DailyUsage, DecisionResult, PolicyConfig } from "@/lib/types/domain";

const testPolicy = {
  ...defaultPolicyConfig,
  allowedHours: undefined,
};

describe("Fortexa decision engine", () => {
  it("ensures all demo scenario ids are unique", () => {
    const ids = demoScenarios.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size, "Found duplicate scenario ids").toBe(ids.length);
  });

  it("keeps every demo scenario aligned with its expected decision", async () => {
    for (const scenario of demoScenarios) {
      const result = await evaluateDecision(scenario.action, testPolicy, defaultDailyUsage);
      expect(result.decision, `Scenario "${scenario.id}" ("${scenario.title}"): expected ${scenario.expectedDecision} but got ${result.decision}`).toBe(scenario.expectedDecision);
    }
  });

  it("approves safe scenario", async () => {
    const action = demoScenarios.find((scenario) => scenario.id === "safe-research-payment")!.action;
    const result = await evaluateDecision(action, testPolicy, defaultDailyUsage);
    expect(result.decision).toBe("APPROVE");
  });

  it("blocks malicious endpoint", async () => {
    const action = demoScenarios.find((scenario) => scenario.id === "blocked-malicious-endpoint")!.action;
    const result = await evaluateDecision(action, testPolicy, defaultDailyUsage);
    expect(result.decision).toBe("BLOCK");
  });

  it("requires approval for over-budget payment", async () => {
    const action = demoScenarios.find((scenario) => scenario.id === "over-budget-transfer")!.action;
    const result = await evaluateDecision(action, testPolicy, defaultDailyUsage);
    expect(result.decision).toBe("REQUIRE_APPROVAL");
  });

  it("blocks prompt injection payload", async () => {
    const action = demoScenarios.find((scenario) => scenario.id === "prompt-injection-output")!.action;
    const result = await evaluateDecision(action, testPolicy, defaultDailyUsage);
    expect(result.decision).toBe("BLOCK");
    expect(result.riskFindings.some((finding) => finding.code === "PROMPT_INJECTION_PATTERN")).toBe(true);
  });

  it("warns for typosquat domains with suspicious TLDs", async () => {
    const action = demoScenarios.find((scenario) => scenario.id === "typosquat-domain-risk")!.action;
    const result = await evaluateDecision(action, testPolicy, defaultDailyUsage);
    expect(result.decision).toBe("WARN");
    expect(result.triggeredPolicies.some((trigger) => trigger.code === "UNLISTED_DOMAIN")).toBe(true);
    expect(result.riskFindings.some((finding) => finding.code === "SUSPICIOUS_TLD")).toBe(true);
  });

  it("requires approval when an allowlisted transfer breaches spend caps", async () => {
    const action = demoScenarios.find((scenario) => scenario.id === "daily-cap-breach")!.action;
    const result = await evaluateDecision(action, testPolicy, defaultDailyUsage);
    expect(result.decision).toBe("REQUIRE_APPROVAL");
    expect(result.triggeredPolicies.some((trigger) => trigger.code === "DAILY_CAP_EXCEEDED")).toBe(true);
  });

  it("blocks outputs that try to exfiltrate wallet secrets", async () => {
    const action = demoScenarios.find((scenario) => scenario.id === "secret-exfiltration-output")!.action;
    const result = await evaluateDecision(action, testPolicy, defaultDailyUsage);
    expect(result.decision).toBe("BLOCK");
    expect(result.riskFindings.some((finding) => finding.code === "SECRET_TARGETING")).toBe(true);
  });
});

describe("scenario snapshot coverage", () => {
  const expectedReviewerOutput: Record<
    string,
    {
      decision: DecisionResult["decision"];
      triggeredPolicyCodes: string[];
      riskFindingCodes: string[];
      explanation: string;
    }
  > = {
    "safe-research-payment": {
      decision: "APPROVE",
      triggeredPolicyCodes: [],
      riskFindingCodes: [],
      explanation:
        "Fortexa approved this action. Policy checks and risk analysis are within trusted operating bounds.",
    },
    "blocked-malicious-endpoint": {
      decision: "BLOCK",
      triggeredPolicyCodes: ["BLOCKED_DOMAIN", "UNLISTED_DOMAIN"],
      riskFindingCodes: ["DOMAIN_REPUTATION_HIGH_RISK"],
      explanation:
        "Fortexa blocked this action because policy and security controls indicate a materially unsafe payment/tool operation.",
    },
    "over-budget-transfer": {
      decision: "REQUIRE_APPROVAL",
      triggeredPolicyCodes: ["PER_TX_CAP_EXCEEDED"],
      riskFindingCodes: ["LARGE_PAYMENT"],
      explanation:
        "Fortexa flagged this as high impact. Manual approval is required before economic execution.",
    },
    "prompt-injection-output": {
      decision: "BLOCK",
      triggeredPolicyCodes: [],
      riskFindingCodes: ["PROMPT_INJECTION_PATTERN"],
      explanation:
        "Fortexa blocked this action because policy and security controls indicate a materially unsafe payment/tool operation.",
    },
    "manual-approval-needed": {
      decision: "REQUIRE_APPROVAL",
      triggeredPolicyCodes: ["PER_TX_CAP_EXCEEDED"],
      riskFindingCodes: ["LARGE_PAYMENT"],
      explanation:
        "Fortexa flagged this as high impact. Manual approval is required before economic execution.",
    },
    "typosquat-domain-risk": {
      decision: "WARN",
      triggeredPolicyCodes: ["UNLISTED_DOMAIN"],
      riskFindingCodes: ["SUSPICIOUS_TLD"],
      explanation:
        "Fortexa allows this action with caution. Risk signals were detected and logged for operator review.",
    },
    "daily-cap-breach": {
      decision: "REQUIRE_APPROVAL",
      triggeredPolicyCodes: ["PER_TX_CAP_EXCEEDED", "DAILY_CAP_EXCEEDED"],
      riskFindingCodes: ["LARGE_PAYMENT"],
      explanation:
        "Fortexa flagged this as high impact. Manual approval is required before economic execution.",
    },
    "secret-exfiltration-output": {
      decision: "BLOCK",
      triggeredPolicyCodes: [],
      riskFindingCodes: ["PROMPT_INJECTION_PATTERN", "SECRET_TARGETING"],
      explanation:
        "Fortexa blocked this action because policy and security controls indicate a materially unsafe payment/tool operation.",
    },
  };

  for (const [scenarioId, expected] of Object.entries(expectedReviewerOutput)) {
    it(`produces stable reviewer output for "${scenarioId}"`, async () => {
      const scenario = demoScenarios.find((s) => s.id === scenarioId)!;
      const result = await evaluateDecision(scenario.action, testPolicy, defaultDailyUsage);

      expect(result.decision).toBe(expected.decision);
      expect(
        result.triggeredPolicies.map((t) => t.code).sort()
      ).toEqual([...expected.triggeredPolicyCodes].sort());
      expect(result.riskFindings.map((f) => f.code).sort()).toEqual(
        [...expected.riskFindingCodes].sort()
      );
      expect(result.explanation).toBe(expected.explanation);
    });
  }
});

describe("human approval rerun", () => {
  async function applyHumanApproval(
    action: AgentAction,
    policy: PolicyConfig,
    usage: DailyUsage
  ): Promise<DecisionResult> {
    const result = await evaluateDecision(action, policy, usage);
    if (result.decision === "REQUIRE_APPROVAL") {
      return {
        ...result,
        decision: "APPROVE",
        explanation:
          "Fortexa approved this action. Policy checks and risk analysis are within trusted operating bounds.",
        requiresManualApproval: false,
      };
    }
    return result;
  }

  it("only changes REQUIRE_APPROVAL decisions when human approval is granted", async () => {
    const originalResults = new Map<string, DecisionResult>();

    for (const scenario of demoScenarios) {
      const original = await evaluateDecision(scenario.action, testPolicy, defaultDailyUsage);
      originalResults.set(scenario.id, original);
    }

    for (const scenario of demoScenarios) {
      const original = originalResults.get(scenario.id)!;
      const approved = await applyHumanApproval(scenario.action, testPolicy, defaultDailyUsage);

      if (original.decision === "REQUIRE_APPROVAL") {
        expect(approved.decision).toBe("APPROVE");
        expect(approved.requiresManualApproval).toBe(false);
        expect(approved.explanation).toBe(
          "Fortexa approved this action. Policy checks and risk analysis are within trusted operating bounds."
        );
      } else {
        expect(approved.decision).toBe(original.decision);
        expect(approved.requiresManualApproval).toBe(original.requiresManualApproval);
        expect(approved.explanation).toBe(original.explanation);
      }
    }
  });

  it("marks only REQUIRE_APPROVAL scenarios as requiresManualApproval", async () => {
    for (const scenario of demoScenarios) {
      const result = await evaluateDecision(scenario.action, testPolicy, defaultDailyUsage);
      if (result.decision === "REQUIRE_APPROVAL") {
        expect(result.requiresManualApproval).toBe(true);
      } else {
        expect(result.requiresManualApproval).toBe(false);
      }
    }
  });
});
