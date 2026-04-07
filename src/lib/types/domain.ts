export type DecisionType = "APPROVE" | "WARN" | "REQUIRE_APPROVAL" | "BLOCK";

export interface AgentAction {
  id: string;
  name: string;
  kind: "api_payment" | "tool_access" | "transfer" | "endpoint_call";
  target: string;
  domain: string;
  amountXLM: number;
  tool?: string;
  outputPreview?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface PolicyConfig {
  allowedDomains: string[];
  blockedDomains: string[];
  allowedTools: string[];
  blockedTools: string[];
  perTxCapXLM: number;
  dailyCapXLM: number;
  maxToolCallsPerDay: number;
  riskThreshold: number;
  allowedHours?: {
    start: number;
    end: number;
  };
}

export interface DailyUsage {
  spentXLM: number;
  toolCalls: number;
  lastUpdated: string;
}

export interface PolicyTrigger {
  code: string;
  message: string;
  severity: "low" | "medium" | "high";
}

export interface PolicyEvaluation {
  hardBlock: boolean;
  requireApproval: boolean;
  warning: boolean;
  triggers: PolicyTrigger[];
}

export interface SecurityFinding {
  code: string;
  title: string;
  detail: string;
  severity: "low" | "medium" | "high";
  scoreDelta: number;
}

export interface SecurityEvaluation {
  riskScore: number;
  findings: SecurityFinding[];
}

export interface DecisionResult {
  decision: DecisionType;
  explanation: string;
  triggeredPolicies: PolicyTrigger[];
  riskScore: number;
  riskFindings: SecurityFinding[];
  requiresManualApproval: boolean;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  action: AgentAction;
  expectedDecision: DecisionType;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: AgentAction;
  decision: DecisionType;
  explanation: string;
  triggeredPolicies: string[];
  riskFindings: string[];
  stellarTxHash?: string;
}

export interface StellarPaymentRequest {
  destination: string;
  amountXLM: string;
  memo?: string;
}
