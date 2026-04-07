import type { AgentAction, SecurityEvaluation, SecurityFinding } from "@/lib/types/domain";

const suspiciousPatterns = [
  /ignore\s+all\s+previous\s+instructions/i,
  /send\s+funds\s+to/i,
  /bypass\s+policy/i,
  /reveal\s+secret/i,
  /exfiltrate/i,
  /execute\s+shell/i,
];

const highRiskTlds = [".zip", ".click", ".top", ".ru"];

function reputationCheck(domain: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (domain.includes("evil") || domain.includes("drainer") || domain.includes("phish")) {
    findings.push({
      code: "DOMAIN_REPUTATION_HIGH_RISK",
      title: "High-risk destination",
      detail: `Domain ${domain} matches high-risk reputation patterns.`,
      severity: "high",
      scoreDelta: 45,
    });
  }

  if (highRiskTlds.some((tld) => domain.endsWith(tld))) {
    findings.push({
      code: "SUSPICIOUS_TLD",
      title: "Suspicious top-level domain",
      detail: `Domain ${domain} ends with a high-risk TLD.`,
      severity: "medium",
      scoreDelta: 16,
    });
  }

  if (domain.includes("redirect") || domain.includes("mirror")) {
    findings.push({
      code: "POTENTIAL_REDIRECT_TRAP",
      title: "Possible redirect mismatch",
      detail: "Endpoint naming suggests potential redirect/man-in-the-middle behavior.",
      severity: "medium",
      scoreDelta: 12,
    });
  }

  return findings;
}

function outputSafetyCheck(outputPreview?: string): SecurityFinding[] {
  if (!outputPreview) {
    return [];
  }

  const findings: SecurityFinding[] = [];
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(outputPreview)) {
      findings.push({
        code: "PROMPT_INJECTION_PATTERN",
        title: "Prompt injection signature detected",
        detail: `Detected suspicious instruction pattern: ${pattern.source}`,
        severity: "high",
        scoreDelta: 35,
      });
      break;
    }
  }

  if (/private key|secret seed|mnemonic/i.test(outputPreview)) {
    findings.push({
      code: "SECRET_TARGETING",
      title: "Sensitive secret extraction attempt",
      detail: "Tool output appears to request wallet secrets or seed phrases.",
      severity: "high",
      scoreDelta: 40,
    });
  }

  return findings;
}

function targetCheck(action: AgentAction): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (action.amountXLM > 90) {
    findings.push({
      code: "LARGE_PAYMENT",
      title: "High-value transfer",
      detail: `Action amount (${action.amountXLM} XLM) is above heuristic caution threshold.`,
      severity: "medium",
      scoreDelta: 14,
    });
  }

  if (action.target.includes("anon") || action.target.includes("temp")) {
    findings.push({
      code: "UNVERIFIED_TARGET",
      title: "Unverified payment target",
      detail: "Destination appears ephemeral or weakly identified.",
      severity: "medium",
      scoreDelta: 10,
    });
  }

  return findings;
}

export function evaluateSecurity(action: AgentAction): SecurityEvaluation {
  const findings = [...reputationCheck(action.domain), ...outputSafetyCheck(action.outputPreview), ...targetCheck(action)];

  const riskScore = Math.min(
    100,
    findings.reduce((acc, finding) => acc + finding.scoreDelta, 10)
  );

  return {
    riskScore,
    findings,
  };
}
