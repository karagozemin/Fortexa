import { describe, expect, it } from "vitest";

import { defaultPolicyConfig } from "@/lib/policy/engine";
import { normalizePolicy } from "@/lib/storage/policy-store";

import emptyPolicy from "./__fixtures__/v0-empty-policy.json";
import legacyMissingArrays from "./__fixtures__/v0-legacy-missing-arrays.json";
import missingOptionalFields from "./__fixtures__/v0-missing-optional-fields.json";
import unknownFutureFields from "./__fixtures__/v0-unknown-future-fields.json";

// Cast needed because JSON fixtures carry a _fixtureNote documentation key
// that is intentionally absent from PolicyConfig.
type Fixture = Partial<typeof defaultPolicyConfig> & { _fixtureNote?: string };

function load(fixture: Fixture) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _fixtureNote, ...policy } = fixture;
  return normalizePolicy(policy);
}

describe("policy migration fixtures — normalizePolicy", () => {
  describe("v0-missing-optional-fields: legacy policy missing riskThreshold, allowedHours, blockedTools", () => {
    it("fills missing riskThreshold with the safe default", () => {
      expect(load(missingOptionalFields).riskThreshold).toBe(defaultPolicyConfig.riskThreshold);
    });

    it("fills missing allowedHours with the safe default", () => {
      expect(load(missingOptionalFields).allowedHours).toEqual(defaultPolicyConfig.allowedHours);
    });

    it("fills missing blockedTools with the safe default", () => {
      expect(load(missingOptionalFields).blockedTools).toEqual(defaultPolicyConfig.blockedTools);
    });

    it("preserves explicitly stored numeric caps without widening them", () => {
      const result = load(missingOptionalFields);
      expect(result.perTxCapXLM).toBe(50);
      expect(result.dailyCapXLM).toBe(200);
      expect(result.maxToolCallsPerDay).toBe(5);
    });

    it("returns a complete PolicyConfig with no undefined required fields", () => {
      const result = load(missingOptionalFields);
      for (const key of ["allowedDomains", "blockedDomains", "allowedTools", "blockedTools",
                          "perTxCapXLM", "dailyCapXLM", "maxToolCallsPerDay", "riskThreshold"] as const) {
        expect(result[key], `field "${key}" should not be undefined`).toBeDefined();
      }
    });
  });

  describe("v0-unknown-future-fields: policy with extra keys from a hypothetical future version", () => {
    it("strips unknown future fields so they cannot widen permissions", () => {
      const result = load(unknownFutureFields) as Record<string, unknown>;
      expect(result["allowedRegions"]).toBeUndefined();
      expect(result["ipAllowlist"]).toBeUndefined();
      expect(result["auditWebhook"]).toBeUndefined();
    });

    it("preserves stored allowedDomains exactly — does not fall back to defaults", () => {
      expect(load(unknownFutureFields).allowedDomains).toEqual(unknownFutureFields.allowedDomains);
    });

    it("preserves stored blockedDomains exactly — does not fall back to defaults", () => {
      expect(load(unknownFutureFields).blockedDomains).toEqual(unknownFutureFields.blockedDomains);
    });

    it("preserves stored numeric caps exactly", () => {
      const result = load(unknownFutureFields);
      expect(result.perTxCapXLM).toBe(unknownFutureFields.perTxCapXLM);
      expect(result.dailyCapXLM).toBe(unknownFutureFields.dailyCapXLM);
    });
  });

  describe("v0-empty-policy: completely empty stored object", () => {
    it("does not throw when given an empty policy", () => {
      expect(() => load(emptyPolicy)).not.toThrow();
    });

    it("resolves every field to the corresponding default", () => {
      expect(load(emptyPolicy)).toEqual({
        allowedDomains:    defaultPolicyConfig.allowedDomains,
        blockedDomains:    defaultPolicyConfig.blockedDomains,
        allowedTools:      defaultPolicyConfig.allowedTools,
        blockedTools:      defaultPolicyConfig.blockedTools,
        perTxCapXLM:       defaultPolicyConfig.perTxCapXLM,
        dailyCapXLM:       defaultPolicyConfig.dailyCapXLM,
        maxToolCallsPerDay: defaultPolicyConfig.maxToolCallsPerDay,
        riskThreshold:     defaultPolicyConfig.riskThreshold,
        allowedHours:      defaultPolicyConfig.allowedHours,
      });
    });
  });

  describe("v0-legacy-missing-arrays: only numeric caps stored, all array fields absent", () => {
    it("restores missing allowedDomains from defaults", () => {
      expect(load(legacyMissingArrays).allowedDomains).toEqual(defaultPolicyConfig.allowedDomains);
    });

    it("restores missing blockedDomains from defaults", () => {
      expect(load(legacyMissingArrays).blockedDomains).toEqual(defaultPolicyConfig.blockedDomains);
    });

    it("restores missing allowedTools from defaults", () => {
      expect(load(legacyMissingArrays).allowedTools).toEqual(defaultPolicyConfig.allowedTools);
    });

    it("restores missing blockedTools from defaults", () => {
      expect(load(legacyMissingArrays).blockedTools).toEqual(defaultPolicyConfig.blockedTools);
    });

    it("preserves the stored numeric caps exactly", () => {
      const result = load(legacyMissingArrays);
      expect(result.perTxCapXLM).toBe(75);
      expect(result.dailyCapXLM).toBe(150);
      expect(result.maxToolCallsPerDay).toBe(4);
      expect(result.riskThreshold).toBe(60);
    });
  });

  describe("nullish-coalescing guard — explicit empty arrays must not be widened to defaults", () => {
    it("preserves an explicitly empty allowedDomains without falling back to defaults", () => {
      const result = normalizePolicy({ allowedDomains: [] });
      expect(result.allowedDomains).toEqual([]);
      expect(result.allowedDomains).not.toEqual(defaultPolicyConfig.allowedDomains);
    });

    it("preserves an explicitly empty blockedDomains without falling back to defaults", () => {
      expect(normalizePolicy({ blockedDomains: [] }).blockedDomains).toEqual([]);
    });

    it("preserves an explicitly empty allowedTools without falling back to defaults", () => {
      expect(normalizePolicy({ allowedTools: [] }).allowedTools).toEqual([]);
    });

    it("preserves an explicitly empty blockedTools without falling back to defaults", () => {
      expect(normalizePolicy({ blockedTools: [] }).blockedTools).toEqual([]);
    });
  });
});
