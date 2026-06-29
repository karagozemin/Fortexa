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
      expect(result.decision, `Scenario \"${scenario.id}\" (\"${scenario.title}\"): expected ${scenario.expectedDecision} but got ${result.decision}`).toBe(scenario.expectedDecision);
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

  it("warns for typosquat domains with suspicious TLDs", async () => {
    const action = demoScenarios.find((scenario) => scenario.id === "typosquat-domain-risk")!.action;
    const result = await evaluateDecision(action, testPolicy, defaultDailyUsage);
    expect(result.decision).toBe("WARN");
    expect(result.triggeredPolicies.some((trigger) => trigger.code === "UNLISTED_DOMAIN")).toBe(true);
    expect(result.riskFindings.some((finding) => finding.code === "SUSPICIOUS_TLD")).toBe(true);
  });

  it("snapshot - approver decision explanation (should not change without manual update)", async () => {
    const action = demoScenarios.find((s) => s.id === "safe-research-payment")!.action;
    const result = await evaluateDecision(action, testPolicy, defaultDailyUsage);
    expect(result.decision).toBe("APPROVE");
    expect(result.explanation).toMatchSnapshot();
  });
});

// How to update snapshots:
//   npm run test -- src/lib/decision/engine.scenarios.test.ts --updateSnapshot
//   These snapshot tests guard the reviewer-facing explanation text to maintain transparency and prevent drift.
