import { describe, expect, it } from "vitest";

import { evaluateDecision } from "@/lib/decision/engine";
import { defaultPolicyConfig } from "@/lib/policy/engine";
import { demoScenarios, defaultDailyUsage } from "@/lib/scenarios/seed";

const testPolicy = {
  ...defaultPolicyConfig,
  allowedHours: undefined,
};

describe("Fortexa decision engine", () => {
  it("keeps every demo scenario aligned with its expected decision", () => {
    for (const scenario of demoScenarios) {
      const result = evaluateDecision(scenario.action, testPolicy, defaultDailyUsage);
      expect(result.decision, scenario.id).toBe(scenario.expectedDecision);
    }
  });

  it("approves safe scenario", () => {
    const action = demoScenarios.find((scenario) => scenario.id === "safe-research-payment")!.action;
    const result = evaluateDecision(action, testPolicy, defaultDailyUsage);
    expect(result.decision).toBe("APPROVE");
  });

  it("blocks malicious endpoint", () => {
    const action = demoScenarios.find((scenario) => scenario.id === "blocked-malicious-endpoint")!.action;
    const result = evaluateDecision(action, testPolicy, defaultDailyUsage);
    expect(result.decision).toBe("BLOCK");
  });

  it("requires approval for over-budget payment", () => {
    const action = demoScenarios.find((scenario) => scenario.id === "over-budget-transfer")!.action;
    const result = evaluateDecision(action, testPolicy, defaultDailyUsage);
    expect(result.decision).toBe("REQUIRE_APPROVAL");
  });

  it("blocks prompt injection payload", () => {
    const action = demoScenarios.find((scenario) => scenario.id === "prompt-injection-output")!.action;
    const result = evaluateDecision(action, testPolicy, defaultDailyUsage);
    expect(result.decision).toBe("BLOCK");
    expect(result.riskFindings.some((finding) => finding.code === "PROMPT_INJECTION_PATTERN")).toBe(true);
  });

  it("warns for typosquat domains with suspicious TLDs", () => {
    const action = demoScenarios.find((scenario) => scenario.id === "typosquat-domain-risk")!.action;
    const result = evaluateDecision(action, testPolicy, defaultDailyUsage);
    expect(result.decision).toBe("WARN");
    expect(result.triggeredPolicies.some((trigger) => trigger.code === "UNLISTED_DOMAIN")).toBe(true);
    expect(result.riskFindings.some((finding) => finding.code === "SUSPICIOUS_TLD")).toBe(true);
  });

  it("requires approval when an allowlisted transfer breaches spend caps", () => {
    const action = demoScenarios.find((scenario) => scenario.id === "daily-cap-breach")!.action;
    const result = evaluateDecision(action, testPolicy, defaultDailyUsage);
    expect(result.decision).toBe("REQUIRE_APPROVAL");
    expect(result.triggeredPolicies.some((trigger) => trigger.code === "DAILY_CAP_EXCEEDED")).toBe(true);
  });

  it("blocks outputs that try to exfiltrate wallet secrets", () => {
    const action = demoScenarios.find((scenario) => scenario.id === "secret-exfiltration-output")!.action;
    const result = evaluateDecision(action, testPolicy, defaultDailyUsage);
    expect(result.decision).toBe("BLOCK");
    expect(result.riskFindings.some((finding) => finding.code === "SECRET_TARGETING")).toBe(true);
  });
});
