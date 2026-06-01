import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { evaluatePolicy, defaultPolicyConfig } from "./engine";
import type { AgentAction, DailyUsage, PolicyConfig } from "@/lib/types/domain";

const mockAction = (overrides: Partial<AgentAction> = {}): AgentAction => ({
  id: "test-action",
  name: "Test Action",
  kind: "api_payment",
  target: "https://api.example.com/v1/pay",
  domain: "api.example.com",
  amountXLM: 10,
  ...overrides,
});

const mockUsage = (overrides: Partial<DailyUsage> = {}): DailyUsage => ({
  spentXLM: 0,
  toolCalls: 0,
  lastUpdated: new Date().toISOString(),
  ...overrides,
});

const mockPolicy = (overrides: Partial<PolicyConfig> = {}): PolicyConfig => ({
  ...defaultPolicyConfig,
  allowedHours: undefined, // Disable time-based policy by default for predictability
  ...overrides,
});

describe("Policy Engine", () => {
  describe("Domain Authorization", () => {
    it("allows explicitly allowed domains", () => {
      const policy = mockPolicy({ allowedDomains: ["safe.ai"], blockedDomains: [] });
      const action = mockAction({ domain: "safe.ai" });
      const result = evaluatePolicy(action, policy, mockUsage());

      expect(result.hardBlock).toBe(false);
      expect(result.warning).toBe(false);
      expect(result.triggers).toHaveLength(0);
    });

    it("blocks explicitly blocked domains with high severity", () => {
      const policy = mockPolicy({ allowedDomains: ["other.ai"], blockedDomains: ["evil.com"] });
      const action = mockAction({ domain: "evil.com" });
      const result = evaluatePolicy(action, policy, mockUsage());

      expect(result.hardBlock).toBe(true);
      expect(result.triggers).toContainEqual(expect.objectContaining({
        code: "BLOCKED_DOMAIN",
        severity: "high"
      }));
    });

    it("warns about unlisted domains (not in allowlist nor blocklist)", () => {
      const policy = mockPolicy({ allowedDomains: ["safe.ai"], blockedDomains: ["evil.com"] });
      const action = mockAction({ domain: "unknown.ai" });
      const result = evaluatePolicy(action, policy, mockUsage());

      expect(result.hardBlock).toBe(false);
      expect(result.warning).toBe(true);
      expect(result.triggers).toContainEqual(expect.objectContaining({
        code: "UNLISTED_DOMAIN",
        severity: "medium"
      }));
    });

    it("prefers blocklist over allowlist if a domain is in both", () => {
      const policy = mockPolicy({ 
        allowedDomains: ["ambiguous.com"], 
        blockedDomains: ["ambiguous.com"] 
      });
      const action = mockAction({ domain: "ambiguous.com" });
      const result = evaluatePolicy(action, policy, mockUsage());

      expect(result.hardBlock).toBe(true);
      expect(result.triggers.some(t => t.code === "BLOCKED_DOMAIN")).toBe(true);
    });
  });

  describe("Tool Authorization", () => {
    it("allows approved tools", () => {
      const policy = mockPolicy({ 
        allowedDomains: ["safe.ai"], // Ensure domain is also allowed
        allowedTools: ["safe-tool"], 
        blockedTools: [] 
      });
      const action = mockAction({ domain: "safe.ai", tool: "safe-tool" });
      const result = evaluatePolicy(action, policy, mockUsage());

      expect(result.hardBlock).toBe(false);
      expect(result.warning).toBe(false);
    });

    it("blocks explicitly blocked tools", () => {
      const policy = mockPolicy({ allowedTools: [], blockedTools: ["evil-tool"] });
      const action = mockAction({ tool: "evil-tool" });
      const result = evaluatePolicy(action, policy, mockUsage());

      expect(result.hardBlock).toBe(true);
      expect(result.triggers).toContainEqual(expect.objectContaining({
        code: "BLOCKED_TOOL",
        severity: "high"
      }));
    });

    it("warns about unapproved tools", () => {
      const policy = mockPolicy({ allowedTools: ["approved"], blockedTools: [] });
      const action = mockAction({ tool: "unapproved" });
      const result = evaluatePolicy(action, policy, mockUsage());

      expect(result.warning).toBe(true);
      expect(result.triggers).toContainEqual(expect.objectContaining({
        code: "UNAPPROVED_TOOL",
        severity: "medium"
      }));
    });
  });

  describe("Spend Caps", () => {
    it("allows amount exactly at per-transaction cap", () => {
      const policy = mockPolicy({ perTxCapXLM: 100 });
      const action = mockAction({ amountXLM: 100 });
      const result = evaluatePolicy(action, policy, mockUsage());

      expect(result.requireApproval).toBe(false);
      expect(result.triggers.some(t => t.code === "PER_TX_CAP_EXCEEDED")).toBe(false);
    });

    it("requires approval when per-transaction cap is exceeded", () => {
      const policy = mockPolicy({ perTxCapXLM: 100 });
      const action = mockAction({ amountXLM: 100.01 });
      const result = evaluatePolicy(action, policy, mockUsage());

      expect(result.requireApproval).toBe(true);
      expect(result.triggers).toContainEqual(expect.objectContaining({
        code: "PER_TX_CAP_EXCEEDED",
        severity: "high"
      }));
    });

    it("allows amount exactly at daily cap", () => {
      const policy = mockPolicy({ dailyCapXLM: 500 });
      const usage = mockUsage({ spentXLM: 400 });
      const action = mockAction({ amountXLM: 100 });
      const result = evaluatePolicy(action, policy, usage);

      expect(result.requireApproval).toBe(false);
    });

    it("requires approval when daily cap is exceeded", () => {
      const policy = mockPolicy({ dailyCapXLM: 500 });
      const usage = mockUsage({ spentXLM: 450 });
      const action = mockAction({ amountXLM: 51 });
      const result = evaluatePolicy(action, policy, usage);

      expect(result.requireApproval).toBe(true);
      expect(result.triggers).toContainEqual(expect.objectContaining({
        code: "DAILY_CAP_EXCEEDED"
      }));
    });
  });

  describe("Usage Limits", () => {
    it("allows tool call exactly at limit", () => {
      const policy = mockPolicy({ 
        allowedDomains: ["safe.ai"],
        allowedTools: ["any"], // Ensure tool is also allowed
        maxToolCallsPerDay: 5 
      });
      const usage = mockUsage({ toolCalls: 4 }); // Next call will be 5th
      const action = mockAction({ domain: "safe.ai", tool: "any" });
      const result = evaluatePolicy(action, policy, usage);

      expect(result.warning).toBe(false);
    });

    it("warns when tool call limit is reached", () => {
      const policy = mockPolicy({ maxToolCallsPerDay: 5 });
      const usage = mockUsage({ toolCalls: 5 }); // Next call will be 6th
      const action = mockAction({ tool: "any" });
      const result = evaluatePolicy(action, policy, usage);

      expect(result.warning).toBe(true);
      expect(result.triggers).toContainEqual(expect.objectContaining({
        code: "TOOL_CALL_LIMIT_REACHED"
      }));
    });
  });

  describe("Time Window Authorization", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("allows action within operation window", () => {
      const policy = mockPolicy({ allowedHours: { start: 9, end: 17 } });
      const action = mockAction();
      
      // Set time to 10:00 AM
      const date = new Date(2024, 0, 1, 10, 0, 0);
      vi.setSystemTime(date);

      const result = evaluatePolicy(action, policy, mockUsage());
      expect(result.triggers.some(t => t.code === "OUTSIDE_ALLOWED_TIME")).toBe(false);
    });

    it("allows action at exact start boundary", () => {
      const policy = mockPolicy({ allowedHours: { start: 9, end: 17 } });
      const action = mockAction();
      
      // 09:00:00
      vi.setSystemTime(new Date(2024, 0, 1, 9, 0, 0));

      const result = evaluatePolicy(action, policy, mockUsage());
      expect(result.triggers.some(t => t.code === "OUTSIDE_ALLOWED_TIME")).toBe(false);
    });

    it("allows action at exact end boundary", () => {
      const policy = mockPolicy({ allowedHours: { start: 9, end: 17 } });
      const action = mockAction();
      
      // 17:59:59.999
      vi.setSystemTime(new Date(2024, 0, 1, 17, 59, 59, 999));

      const result = evaluatePolicy(action, policy, mockUsage());
      expect(result.triggers.some(t => t.code === "OUTSIDE_ALLOWED_TIME")).toBe(false);
    });

    it("warns when outside operation window (before start)", () => {
      const policy = mockPolicy({ allowedHours: { start: 9, end: 17 } });
      const action = mockAction();
      
      // 08:59:59
      vi.setSystemTime(new Date(2024, 0, 1, 8, 59, 59));

      const result = evaluatePolicy(action, policy, mockUsage());
      expect(result.warning).toBe(true);
      expect(result.triggers).toContainEqual(expect.objectContaining({
        code: "OUTSIDE_ALLOWED_TIME",
        severity: "medium"
      }));
    });

    it("warns when outside operation window (after end)", () => {
      const policy = mockPolicy({ allowedHours: { start: 9, end: 17 } });
      const action = mockAction();
      
      // 18:00:00
      vi.setSystemTime(new Date(2024, 0, 1, 18, 0, 0));

      const result = evaluatePolicy(action, policy, mockUsage());
      expect(result.warning).toBe(true);
      expect(result.triggers).toContainEqual(expect.objectContaining({
        code: "OUTSIDE_ALLOWED_TIME"
      }));
    });
  });

  describe("Edge Cases & Configuration Safety", () => {
    it("handles missing tool field safely", () => {
      const policy = mockPolicy({ allowedTools: ["t1"], blockedTools: ["t2"] });
      const action = mockAction({ tool: undefined });
      const result = evaluatePolicy(action, policy, mockUsage());

      expect(result.triggers.some(t => ["BLOCKED_TOOL", "UNAPPROVED_TOOL"].includes(t.code))).toBe(false);
    });

    it("handles empty policy lists correctly", () => {
      const policy = mockPolicy({ 
        allowedDomains: [], 
        blockedDomains: [], 
        allowedTools: [], 
        blockedTools: [] 
      });
      const action = mockAction({ domain: "any.com", tool: "any-tool" });
      const result = evaluatePolicy(action, policy, mockUsage());

      // Should warn for unlisted domain and tool since allowlists are empty
      expect(result.triggers.some(t => t.code === "UNLISTED_DOMAIN")).toBe(true);
      expect(result.triggers.some(t => t.code === "UNAPPROVED_TOOL")).toBe(true);
      expect(result.hardBlock).toBe(false);
    });

    it("handles zero spend caps correctly", () => {
      const policy = mockPolicy({ perTxCapXLM: 0, dailyCapXLM: 0 });
      const action = mockAction({ amountXLM: 0.0001 });
      const result = evaluatePolicy(action, policy, mockUsage());

      expect(result.requireApproval).toBe(true);
      expect(result.triggers.some(t => t.code === "PER_TX_CAP_EXCEEDED")).toBe(true);
      expect(result.triggers.some(t => t.code === "DAILY_CAP_EXCEEDED")).toBe(true);
    });
  });

  describe("Integration & Combined Rules", () => {
    it("identifies multiple triggers simultaneously", () => {
      const policy = mockPolicy({
        blockedDomains: ["evil.com"],
        perTxCapXLM: 50,
      });
      const action = mockAction({
        domain: "evil.com",
        amountXLM: 100,
      });
      const result = evaluatePolicy(action, policy, mockUsage());

      expect(result.hardBlock).toBe(true);
      expect(result.requireApproval).toBe(true);
      expect(result.warning).toBe(true); // evil.com is also not in allowedDomains
      expect(result.triggers).toHaveLength(3); // BLOCKED_DOMAIN, UNLISTED_DOMAIN, PER_TX_CAP_EXCEEDED
    });

    it("prioritizes hardBlock when multiple flags are set", () => {
      const policy = mockPolicy({
        blockedTools: ["banned-tool"],
        dailyCapXLM: 100,
      });
      const usage = mockUsage({ spentXLM: 150 });
      const action = mockAction({ tool: "banned-tool" });
      const result = evaluatePolicy(action, policy, usage);

      expect(result.hardBlock).toBe(true);
      expect(result.requireApproval).toBe(true);
      expect(result.triggers.some(t => t.code === "BLOCKED_TOOL")).toBe(true);
      expect(result.triggers.some(t => t.code === "DAILY_CAP_EXCEEDED")).toBe(true);
    });
  });

  describe("Default Policy Configuration", () => {
    it("validates against the actual defaultPolicyConfig", () => {
      const action = mockAction({
        domain: "api.safe-research.ai",
        tool: "research-pro",
        amountXLM: 10,
      });
      const usage = mockUsage({ spentXLM: 0, toolCalls: 0 });
      
      // We need to handle the allowedHours in defaultPolicyConfig
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2024, 0, 1, 12, 0, 0)); // 12:00 PM, within 6-23

      const result = evaluatePolicy(action, defaultPolicyConfig, usage);
      
      expect(result.hardBlock).toBe(false);
      expect(result.warning).toBe(false);
      expect(result.requireApproval).toBe(false);
      
      vi.useRealTimers();
    });
  });
});
