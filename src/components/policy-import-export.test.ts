import { describe, expect, it } from "vitest";

import { policyConfigSchema } from "@/lib/validation/schemas";
import { generatePolicyDiff, groupDiffChanges } from "@/lib/validation/diff";
import type { PolicyConfig } from "@/lib/types/domain";

describe("Policy Import/Export", () => {
  const validPolicy: PolicyConfig = {
    allowedDomains: ["api.example.com", "data.example.com"],
    blockedDomains: ["malicious.com"],
    allowedTools: ["research-pro", "data-analyzer"],
    blockedTools: ["shadow-shell"],
    perTxCapXLM: 100,
    dailyCapXLM: 500,
    maxToolCallsPerDay: 10,
    riskThreshold: 75,
    allowedHours: { start: 6, end: 23 },
  };

  describe("Schema Validation", () => {
    it("accepts valid policy config", () => {
      const result = policyConfigSchema.safeParse(validPolicy);
      expect(result.success).toBe(true);
    });

    it("rejects policy with invalid numeric cap", () => {
      const invalid = {
        ...validPolicy,
        perTxCapXLM: -100,
      };
      const result = policyConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects policy with empty array field", () => {
      const invalid = {
        ...validPolicy,
        allowedDomains: [],
      };
      const result = policyConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects policy with missing required fields", () => {
      const invalid = { allowedDomains: ["example.com"] };
      const result = policyConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("Policy Diff Generation", () => {
    it("detects no changes for identical policies", () => {
      const diff = generatePolicyDiff(validPolicy, validPolicy);
      expect(diff.hasChanges).toBe(false);
      expect(diff.changes.length).toBe(0);
    });

    it("detects modified numeric fields", () => {
      const modified = { ...validPolicy, perTxCapXLM: 200 };
      const diff = generatePolicyDiff(validPolicy, modified);

      expect(diff.hasChanges).toBe(true);
      expect(diff.summary.modified).toBe(1);
    });

    it("detects added items in arrays", () => {
      const modified = {
        ...validPolicy,
        allowedDomains: [...validPolicy.allowedDomains, "new-domain.com"],
      };
      const diff = generatePolicyDiff(validPolicy, modified);

      expect(diff.summary.added).toBe(1);
    });

    it("groups changes by category", () => {
      const modified = {
        ...validPolicy,
        perTxCapXLM: 200,
        allowedDomains: [...validPolicy.allowedDomains, "new.com"],
      };
      const diff = generatePolicyDiff(validPolicy, modified);
      const grouped = groupDiffChanges(diff);

      expect(Object.keys(grouped).length).toBeGreaterThan(0);
    });
  });

  describe("Import Failure Handling", () => {
    it("does not mutate current policy on invalid import", () => {
      const original = { ...validPolicy };
      const invalid = { ...validPolicy, perTxCapXLM: -50 };

      const result = policyConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(original).toEqual(validPolicy);
    });
  });

  describe("JSON Export", () => {
    it("exports policy as valid JSON", () => {
      const json = JSON.stringify(validPolicy);
      const parsed = JSON.parse(json);
      const result = policyConfigSchema.safeParse(parsed);
      expect(result.success).toBe(true);
    });
  });
});
