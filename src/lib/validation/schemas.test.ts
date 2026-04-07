import { describe, expect, it } from "vitest";

import { agentPlanRequestSchema, policyConfigSchema, stellarBuildPaymentRequestSchema } from "@/lib/validation/schemas";

describe("validation schemas", () => {
  it("accepts valid policy config", () => {
    const parsed = policyConfigSchema.safeParse({
      allowedDomains: ["api.safe-research.ai"],
      blockedDomains: ["wallet-drainer.evil"],
      allowedTools: ["research-pro"],
      blockedTools: ["shadow-shell"],
      perTxCapXLM: 120,
      dailyCapXLM: 300,
      maxToolCallsPerDay: 8,
      riskThreshold: 78,
      allowedHours: { start: 6, end: 23 },
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects invalid destination in stellar build schema", () => {
    const parsed = stellarBuildPaymentRequestSchema.safeParse({
      destination: "not-a-stellar-key",
      amountXLM: "10.0",
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts valid agent plan request", () => {
    const parsed = agentPlanRequestSchema.safeParse({
      goal: "Find a safe data provider and plan payment.",
      context: "Need low-risk endpoint.",
    });

    expect(parsed.success).toBe(true);
  });
});
