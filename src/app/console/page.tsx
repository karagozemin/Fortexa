import { DecisionConsole } from "@/components/decision-console";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ConsolePage() {
  return (
    <main className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Live Decision Console</CardTitle>
          <CardDescription>
            Interactive control room for running agent actions through policy + security checks, then optionally executing payments.
          </CardDescription>
        </CardHeader>
      </Card>
      <DecisionConsole />
    </main>
  );
}
