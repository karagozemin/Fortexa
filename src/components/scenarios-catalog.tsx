import { DecisionBadge } from "@/components/decision-badge";
import { demoScenarios } from "@/lib/scenarios/seed";

export function ScenariosCatalog() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {demoScenarios.map((scenario) => (
        <div key={scenario.id} className="surface-elevated p-5 transition hover:border-[hsl(var(--accent)/0.15)]">
          <div className="mb-3 flex items-start justify-between gap-3">
            <p className="font-medium">{scenario.title}</p>
            <DecisionBadge decision={scenario.expectedDecision} />
          </div>
          <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">{scenario.description}</p>
          <dl className="grid gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            <div className="flex justify-between border-t border-[hsl(var(--border)/0.5)] pt-2">
              <dt>Target</dt>
              <dd className="font-mono text-[hsl(var(--foreground))]">{scenario.action.target}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Domain</dt>
              <dd>{scenario.action.domain}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Amount</dt>
              <dd>{scenario.action.amountXLM} XLM</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}
