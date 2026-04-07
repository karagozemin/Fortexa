import { evaluateDecision } from "../src/lib/decision/engine";
import { defaultPolicyConfig } from "../src/lib/policy/engine";
import { demoScenarios, defaultDailyUsage } from "../src/lib/scenarios/seed";

console.log("Fortexa Scenario Demo Runner\n");

for (const scenario of demoScenarios) {
  const result = evaluateDecision(scenario.action, defaultPolicyConfig, defaultDailyUsage);
  console.log(`Scenario: ${scenario.title}`);
  console.log(`Expected: ${scenario.expectedDecision} | Actual: ${result.decision}`);
  console.log(`Risk Score: ${result.riskScore}`);
  console.log(`Explanation: ${result.explanation}`);
  if (result.triggeredPolicies.length > 0) {
    console.log(`Policies: ${result.triggeredPolicies.map((item) => item.code).join(", ")}`);
  }
  if (result.riskFindings.length > 0) {
    console.log(`Findings: ${result.riskFindings.map((item) => item.code).join(", ")}`);
  }
  console.log("---");
}
