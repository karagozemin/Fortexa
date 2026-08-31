import { isWithinInterval } from "date-fns";
import { normalizeDomain } from "@/lib/policy/domain";

import type { AgentAction, DailyUsage, PolicyConfig, PolicyEvaluation, PolicyTrigger } from "@/lib/types/domain";

/**
 * Raised when a policy contains duplicate identifiers within a single rule
 * list (allowedDomains, blockedDomains, allowedTools, blockedTools).
 */
export class DuplicateRuleError extends Error {
  public readonly field: string;
  public readonly value: string;

  constructor(field: string, value: string) {
    super(
      `Duplicate rule identifier "${value}" found in ${field}. Remove the duplicate before saving or evaluating the policy.`,
    );
    this.name = "DuplicateRuleError";
    this.field = field;
    this.value = value;
  }
}

const RULE_LISTS: Array<keyof Pick<
  PolicyConfig,
  "allowedDomains" | "blockedDomains" | "allowedTools" | "blockedTools"
>> = ["allowedDomains", "blockedDomains", "allowedTools", "blockedTools"];

/**
 * Reject a policy that contains repeated identifiers within any single rule
 * list. Identifiers are compared case-sensitively because domain normalization
 * is applied elsewhere and tool names are case-sensitive by convention.
 *
 * @throws {DuplicateRuleError} when a duplicate is found.
 */
export function validateNoDuplicateRules(policy: PolicyConfig): void {
  for (const field of RULE_LISTS) {
    const seen = new Set<string>();
    for (const id of policy[field]) {
      if (seen.has(id)) {
        throw new DuplicateRuleError(field, id);
      }
      seen.add(id);
    }
  }
}

export const defaultPolicyConfig: PolicyConfig = {
  allowedDomains: ["api.safe-research.ai", "tools.verified-data.dev", "workers.fortexa-demo.stellar"],
  blockedDomains: ["wallet-drainer.evil", "prompt-pwn.io", "untrusted-mirror.xyz"],
  allowedTools: ["research-pro", "market-feed", "settlement-worker"],
  blockedTools: ["shadow-shell", "autonomous-payout-bypass"],
  perTxCapXLM: 120,
  dailyCapXLM: 300,
  maxToolCallsPerDay: 8,
  riskThreshold: 78,
  allowedHours: {
    start: 6,
    end: 23,
  },
};

export function evaluatePolicy(action: AgentAction, policy: PolicyConfig, usage: DailyUsage): PolicyEvaluation {
  validateNoDuplicateRules(policy);

  const triggers: PolicyTrigger[] = [];

  const normalizedDomain = normalizeDomain(action.domain);

  if (!normalizedDomain) {
    triggers.push({
      code: "MALFORMED_DOMAIN",
      message: `Domain ${action.domain} is malformed or invalid.`,
      severity: "high",
    });
  } else {
    if (policy.blockedDomains.includes(normalizedDomain)) {
      triggers.push({
        code: "BLOCKED_DOMAIN",
        message: `Domain ${normalizedDomain} is explicitly blocked by policy.`,
        severity: "high",
      });
    }

    if (!policy.allowedDomains.includes(normalizedDomain)) {
      triggers.push({
        code: "UNLISTED_DOMAIN",
        message: `Domain ${normalizedDomain} is not present in allowlist.`,
        severity: "medium",
      });
    }
  }

  if (action.tool && policy.blockedTools.includes(action.tool)) {
    triggers.push({
      code: "BLOCKED_TOOL",
      message: `Tool ${action.tool} is blocked.`,
      severity: "high",
    });
  }

  if (action.tool && !policy.allowedTools.includes(action.tool)) {
    triggers.push({
      code: "UNAPPROVED_TOOL",
      message: `Tool ${action.tool} is not approved.`,
      severity: "medium",
    });
  }

  if (action.amountXLM > policy.perTxCapXLM) {
    triggers.push({
      code: "PER_TX_CAP_EXCEEDED",
      message: `Amount ${action.amountXLM} XLM exceeds per transaction cap (${policy.perTxCapXLM} XLM).`,
      severity: "high",
    });
  }

  if (usage.spentXLM + action.amountXLM > policy.dailyCapXLM) {
    triggers.push({
      code: "DAILY_CAP_EXCEEDED",
      message: `Action would exceed daily budget (${policy.dailyCapXLM} XLM).`,
      severity: "high",
    });
  }

  if (usage.toolCalls + 1 > policy.maxToolCallsPerDay) {
    triggers.push({
      code: "TOOL_CALL_LIMIT_REACHED",
      message: `Tool call limit (${policy.maxToolCallsPerDay}) reached for today.`,
      severity: "medium",
    });
  }

  if (policy.allowedHours) {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    start.setHours(policy.allowedHours.start, 0, 0, 0);
    end.setHours(policy.allowedHours.end, 59, 59, 999);

    if (!isWithinInterval(now, { start, end })) {
      triggers.push({
        code: "OUTSIDE_ALLOWED_TIME",
        message: `Action is outside allowed operation window (${policy.allowedHours.start}:00-${policy.allowedHours.end}:59).`,
        severity: "medium",
      });
    }
  }

  const hardBlock = triggers.some((t) => t.severity === "high" && ["BLOCKED_DOMAIN", "BLOCKED_TOOL", "MALFORMED_DOMAIN"].includes(t.code));
  const requireApproval = triggers.some((t) => t.code === "PER_TX_CAP_EXCEEDED" || t.code === "DAILY_CAP_EXCEEDED");
  const warning = triggers.some((t) => t.severity === "medium");

  return {
    hardBlock,
    requireApproval,
    warning,
    triggers,
  };
}
