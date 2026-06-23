import { describe, expect, it } from "vitest";

import {
  MAX_AUDIT_SAMPLE_SIZE,
  auditSampleCases,
  scenarioCases,
  simulatePolicyChange,
} from "@/lib/decision/simulate";
import { defaultPolicyConfig } from "@/lib/policy/engine";
import { defaultDailyUsage } from "@/lib/scenarios/seed";
import type { AuditEntry, PolicyConfig } from "@/lib/types/domain";

// Drop the time window so decisions stay deterministic regardless of wall clock.
const currentPolicy: PolicyConfig = { ...defaultPolicyConfig, allowedHours: undefined };

function makeAuditEntry(id: string, amountXLM: number): AuditEntry {
  return {
    id,
    timestamp: new Date().toISOString(),
    action: {
      id: `action-${id}`,
      name: `Audit action ${id}`,
      kind: "api_payment",
      target: "research-pro:query",
      domain: "api.safe-research.ai",
      amountXLM,
      tool: "research-pro",
    },
    decision: "APPROVE",
    explanation: "seed",
    triggeredPolicies: [],
    riskFindings: [],
  };
}

describe("simulatePolicyChange", () => {
  it("reports current vs proposed decisions and flags changes", async () => {
    // Raising the caps turns the over-budget transfer from REQUIRE_APPROVAL into APPROVE.
    const proposedPolicy: PolicyConfig = {
      ...currentPolicy,
      perTxCapXLM: 1000,
      dailyCapXLM: 100000,
    };

    const report = await simulatePolicyChange({
      currentPolicy,
      proposedPolicy,
      cases: scenarioCases(),
      usage: defaultDailyUsage,
    });

    const overBudget = report.cases.find((c) => c.id === "scenario:over-budget-transfer");
    expect(overBudget).toBeDefined();
    expect(overBudget!.current.decision).toBe("REQUIRE_APPROVAL");
    // Raising the caps clears the spend-cap trigger, so the action is no longer held for approval.
    expect(overBudget!.proposed.decision).not.toBe("REQUIRE_APPROVAL");
    expect(overBudget!.changed).toBe(true);

    // A hard-blocked malicious endpoint is unaffected by raising caps.
    const malicious = report.cases.find((c) => c.id === "scenario:blocked-malicious-endpoint");
    expect(malicious!.current.decision).toBe("BLOCK");
    expect(malicious!.proposed.decision).toBe("BLOCK");
    expect(malicious!.changed).toBe(false);

    expect(report.summary.total).toBe(report.cases.length);
    expect(report.summary.changed).toBe(report.cases.filter((c) => c.changed).length);
    expect(report.summary.changed).toBeGreaterThan(0);
  });

  it("reports zero changes when the proposed policy equals the current one", async () => {
    const report = await simulatePolicyChange({
      currentPolicy,
      proposedPolicy: { ...currentPolicy },
      cases: scenarioCases(),
      usage: defaultDailyUsage,
    });

    expect(report.summary.changed).toBe(0);
    expect(report.cases.every((c) => !c.changed)).toBe(true);
  });

  it("does not mutate the input policies or usage", async () => {
    const proposedPolicy: PolicyConfig = { ...currentPolicy, perTxCapXLM: 999 };

    const currentSnapshot = JSON.stringify(currentPolicy);
    const proposedSnapshot = JSON.stringify(proposedPolicy);
    const usageSnapshot = JSON.stringify(defaultDailyUsage);

    await simulatePolicyChange({
      currentPolicy,
      proposedPolicy,
      cases: scenarioCases(),
      usage: defaultDailyUsage,
    });

    expect(JSON.stringify(currentPolicy)).toBe(currentSnapshot);
    expect(JSON.stringify(proposedPolicy)).toBe(proposedSnapshot);
    expect(JSON.stringify(defaultDailyUsage)).toBe(usageSnapshot);
  });
});

describe("auditSampleCases", () => {
  it("takes the newest entries up to the requested sample size", () => {
    const entries = [makeAuditEntry("1", 10), makeAuditEntry("2", 20), makeAuditEntry("3", 30)];
    const cases = auditSampleCases(entries, 2);

    expect(cases).toHaveLength(2);
    expect(cases[0].id).toBe("audit:1");
    expect(cases[1].id).toBe("audit:2");
    expect(cases.every((c) => c.source === "audit")).toBe(true);
  });

  it("clamps the sample size to the maximum", () => {
    const entries = Array.from({ length: 20 }, (_, index) => makeAuditEntry(String(index), index));
    const cases = auditSampleCases(entries, 999);

    expect(cases).toHaveLength(MAX_AUDIT_SAMPLE_SIZE);
  });

  it("returns no cases for empty audit history", () => {
    expect(auditSampleCases([], 5)).toEqual([]);
  });
});
