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

/** Analyzer component status - tracks timeout, failure, or success states. */
export type AnalyzerComponentStatus =
  | "success"
  | "timeout"
  | "error"
  | "degraded";

/** Tracks health and availability of security checks. */
export interface AnalyzerStatus {
  // Blocklist fetch status
  blocklistStatus: AnalyzerComponentStatus;
  blocklistError?: string;
  blocklistTimedOut?: boolean;
  // Future: risk feed status
  riskFeedStatus?: AnalyzerComponentStatus;
  riskFeedError?: string;
  riskFeedTimedOut?: boolean;
  // Whether the evaluation is operating in degraded mode (not all checks ran)
  isDegraded: boolean;
  degradationReasons?: string[];
}

export interface SecurityEvaluation {
  riskScore: number;
  findings: SecurityFinding[];
  analyzerStatus: AnalyzerStatus;
}

export interface DecisionResult {
  decision: DecisionType;
  explanation: string;
  triggeredPolicies: PolicyTrigger[];
  riskScore: number;
  riskFindings: SecurityFinding[];
  requiresManualApproval: boolean;
  /** Analyzer health metadata - tracks timeouts and degradation. */
  analyzerStatus?: AnalyzerStatus;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  action: AgentAction;
  expectedDecision: DecisionType;
}

export type StellarNetworkId = "testnet";

export type StellarAssetId = "native";

/** Immutable payment parameters authorized by an APPROVE/WARN decision. */
export interface PaymentQuote {
  destination: string;
  amountXLM: string;
  asset: StellarAssetId;
  memo: string;
  network: StellarNetworkId;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: AgentAction;
  decision: DecisionType;
  explanation: string;
  triggeredPolicies: string[];
  riskFindings: string[];
  /** Set when the decision authorizes a Stellar payment execution. */
  paymentQuote?: PaymentQuote;
  stellarTxHash?: string;
  /** SHA-256 digest of this entry's canonical fields + previousHash. */
  entryHash?: string;
  /** entryHash of the preceding entry, or the genesis sentinel for the first. */
  previousHash?: string;
  /** Analyzer health at time of decision - tracks if checks timed out or degraded. */
  analyzerStatus?: {
    isDegraded: boolean;
    degradationReasons?: string[];
    blocklistStatus?: AnalyzerComponentStatus;
  };
}

export interface StellarPaymentRequest {
  destination: string;
  amountXLM: string;
  memo?: string;
}
