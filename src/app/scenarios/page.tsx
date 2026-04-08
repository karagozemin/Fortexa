import { DecisionBadge } from "@/components/decision-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { demoScenarios } from "@/lib/scenarios/seed";

export default function ScenariosPage() {
  return (
    <main className="space-y-6">
      <Card className="border-cyan-300/20 bg-[linear-gradient(180deg,rgba(15,29,55,0.6),rgba(10,16,31,0.6))]">
        <CardHeader>
          <CardDescription>Demo Readiness</CardDescription>
          <CardTitle className="text-2xl">Scenario Runner Catalog</CardTitle>
          <CardDescription>Curated demo journeys showcasing approve, warn, manual-approval, and block outcomes.</CardDescription>
        </CardHeader>
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        {demoScenarios.map((scenario) => (
          <Card key={scenario.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{scenario.title}</CardTitle>
                <DecisionBadge decision={scenario.expectedDecision} />
              </div>
              <CardDescription>{scenario.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[hsl(var(--muted-foreground))]">
              <p>
                <span className="text-white">Target:</span> {scenario.action.target}
              </p>
              <p>
                <span className="text-white">Domain:</span> {scenario.action.domain}
              </p>
              <p>
                <span className="text-white">Amount:</span> {scenario.action.amountXLM} XLM
              </p>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
