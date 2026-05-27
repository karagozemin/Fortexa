import { describe, expect, it } from "vitest";

import { evaluateDecision } from "@/lib/decision/engine";
import { defaultPolicyConfig } from "@/lib/policy/engine";
import { demoScenarios, defaultDailyUsage } from "@/lib/scenarios/seed";

const testPolicy = {
  ...defaultPolicyConfig,
  allowedHours: undefined,
};

describe("Fortexa decision engine", () => {
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
});
