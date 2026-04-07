import { describe, expect, it } from "vitest";

import { evaluateDecision } from "@/lib/decision/engine";
import { defaultPolicyConfig } from "@/lib/policy/engine";
import { demoScenarios, defaultDailyUsage } from "@/lib/scenarios/seed";

const testPolicy = {
  ...defaultPolicyConfig,
  allowedHours: undefined,
};

describe("Fortexa decision engine", () => {
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
});
