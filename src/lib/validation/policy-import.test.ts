/**
 * Tests for validatePolicyImport — Issue #30
 */
import { describe, it, expect } from "vitest";
import { validatePolicyImport } from "./policy-import";

const VALID: object = {
  allowedDomains:    ["stellar.org"],
  blockedDomains:    ["malicious.io"],
  allowedTools:      ["transfer"],
  blockedTools:      ["delete"],
  perTxCapXLM:       500,
  dailyCapXLM:       5000,
  maxToolCallsPerDay: 100,
  riskThreshold:     75,
  allowedHours:      { start: 8, end: 20 },
};

describe("validatePolicyImport", () => {
  it("ok:true for valid JSON + valid schema", () => {
    const r = validatePolicyImport(JSON.stringify(VALID));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.policy.riskThreshold).toBe(75);
  });

  it("ok:false — malformed JSON", () => {
    const r = validatePolicyImport("{bad json}");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/invalid json/i);
  });

  it("ok:false —a violation (riskThreshold out of range)", () => {
    const r = validatePolicyImport(JSON.stringify({ ...VALID, riskThreshold: 999 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors).toBeDefined();
  });

  it("ok:false — missing required field (allowedDomains)", () => {
    const { allowedDomains: _, ...rest } = VALID as Record<string, unknown>;
    const r = validatePolicyImport(JSON.stringify(rest));
    expect(r.ok).toBe(false);
  });

  it("ok:false — empty string", () => {
    expect(validatePolicyImport("").ok).toBe(false);
  });

  it("ok:false — JSON null", () => {
    expect(validatePolicyImport("null").ok).toBe(false);
  });

  it("preserves fieldErrors path for nested violation", () => {
    const r = validatePolicyImport(
      JSON.stringify({ ...VALID, allowedHours: { start: 25, end: 8 } })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors ?? {})).toContain("allowedHours.start");
  });
});
