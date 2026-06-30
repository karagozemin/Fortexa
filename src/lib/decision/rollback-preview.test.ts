import { describe, expect, it } from "vitest";

import { scenarioCases, simulatePolicyRollback } from "@/lib/decision/simulate";
import { defaultPolicyConfig } from "@/lib/policy/engine";
import { defaultDailyUsage } from "@/lib/scenarios/seed";
import type { PolicyConfig } from "@/lib/types/domain";

const currentPolicy: PolicyConfig = { ...defaultPolicyConfig, allowedHours: undefined };

describe("simulatePolicyRollback", () => {
  it("reports current vs rollback decisions for seeded scenarios", async () => {
    const rollbackPolicy: PolicyConfig = {
      ...currentPolicy,
      perTxCapXLM: 1000,
      dailyCapXLM: 100000,
    };

    const report = await simulatePolicyRollback({
      currentPolicy,
      rollbackPolicy,
      cases: scenarioCases(),
      usage: defaultDailyUsage,
    });

    const overBudget = report.cases.find((entry) => entry.id === "scenario:over-budget-transfer");
    expect(overBudget).toBeDefined();
    expect(overBudget!.changed).toBe(true);
    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.summary.changed).toBeGreaterThan(0);
  });

  it("does not mutate policy inputs or usage", async () => {
    const rollbackPolicy: PolicyConfig = { ...currentPolicy, perTxCapXLM: 50 };
    const currentSnapshot = JSON.stringify(currentPolicy);
    const rollbackSnapshot = JSON.stringify(rollbackPolicy);
    const usageSnapshot = JSON.stringify(defaultDailyUsage);

    await simulatePolicyRollback({
      currentPolicy,
      rollbackPolicy,
      cases: scenarioCases(),
      usage: defaultDailyUsage,
    });

    expect(JSON.stringify(currentPolicy)).toBe(currentSnapshot);
    expect(JSON.stringify(rollbackPolicy)).toBe(rollbackSnapshot);
    expect(JSON.stringify(defaultDailyUsage)).toBe(usageSnapshot);
  });
});
