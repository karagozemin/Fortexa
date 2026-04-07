import { DecisionBadge } from "@/components/decision-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listAuditEntries } from "@/lib/storage/audit-store";

export default async function ActivityPage() {
  const entries = listAuditEntries();

  return (
    <main className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>
            Immutable-style event log of attempted actions, policy triggers, risk findings, and final decisions.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="space-y-3">
        {entries.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-[hsl(var(--muted-foreground))]">
              No audit entries yet. Run scenarios in the Decision Console to populate this timeline.
            </CardContent>
          </Card>
        ) : (
          entries.map((entry) => (
            <Card key={entry.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{entry.action.name}</CardTitle>
                    <CardDescription>
                      {new Date(entry.timestamp).toLocaleString()} · {entry.action.amountXLM} XLM · {entry.action.target}
                    </CardDescription>
                  </div>
                  <DecisionBadge decision={entry.decision} />
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-[hsl(var(--muted-foreground))]">
                <p>{entry.explanation}</p>
                {entry.triggeredPolicies.length ? <p>Policies: {entry.triggeredPolicies.join(" | ")}</p> : null}
                {entry.riskFindings.length ? <p>Risk: {entry.riskFindings.join(" | ")}</p> : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
