import { DecisionConsole } from "@/components/decision-console";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ConsolePage() {
  return (
    <main className="space-y-6">
      <Card className="premium-panel border-cyan-300/20 bg-[linear-gradient(180deg,rgba(11,22,42,0.84),rgba(8,14,26,0.84))]">
        <CardHeader>
          <CardDescription>Core Product Surface</CardDescription>
          <CardTitle className="text-2xl">Live Decision Console</CardTitle>
          <CardDescription>
            Mission-control surface for evaluating agent actions, applying approvals, and executing wallet-signed Stellar transactions with full traceability.
          </CardDescription>
        </CardHeader>
      </Card>
      <DecisionConsole />
    </main>
  );
}
