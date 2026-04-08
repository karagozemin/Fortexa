import { DecisionBadge } from "@/components/decision-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cookies } from "next/headers";
import { Clock4, ScrollText } from "lucide-react";

import { AUTH_COOKIE_KEY, verifySessionToken } from "@/lib/auth/session";
import { listAuditEntries } from "@/lib/storage/audit-store";

export default async function ActivityPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_COOKIE_KEY)?.value;
  const session = sessionToken ? verifySessionToken(sessionToken) : null;
  const userId = session?.userId;
  const entries = userId ? await listAuditEntries(userId) : [];

  return (
    <main className="space-y-6">
      <Card className="premium-panel border-cyan-300/20 bg-[linear-gradient(180deg,rgba(11,22,42,0.82),rgba(9,14,26,0.84))]">
        <CardHeader>
          <CardDescription>Evidence Layer</CardDescription>
          <CardTitle className="text-2xl">Audit Trail</CardTitle>
          <CardDescription>
            Immutable-style event log of attempted actions, policy triggers, risk findings, and final decisions.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="relative space-y-4 pl-0 md:pl-4">
        <div className="absolute bottom-0 left-1.5 top-0 hidden w-px bg-[hsl(var(--border))] md:block" />
        {entries.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-[hsl(var(--muted-foreground))]">
              No audit entries yet. Run scenarios in the Decision Console to populate this timeline.
            </CardContent>
          </Card>
        ) : (
          entries.map((entry) => (
            <Card key={entry.id} className="premium-panel relative overflow-hidden md:ml-4">
              <div className="absolute -left-5.5 top-7 hidden h-3 w-3 rounded-full border border-cyan-300/50 bg-cyan-400/30 md:block" />
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
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-[hsl(var(--border))] px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-300">Tool</p>
                    <p>{entry.action.name}</p>
                  </div>
                  <div className="rounded-lg border border-[hsl(var(--border))] px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-300">Amount</p>
                    <p>{entry.action.amountXLM} XLM</p>
                  </div>
                  <div className="rounded-lg border border-[hsl(var(--border))] px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-300 inline-flex items-center gap-1"><Clock4 className="h-3.5 w-3.5" /> Timestamp</p>
                    <p>{new Date(entry.timestamp).toLocaleTimeString()}</p>
                  </div>
                </div>
                <p className="rounded-lg border border-[hsl(var(--border))] px-3 py-2">{entry.explanation}</p>
                {entry.triggeredPolicies.length ? (
                  <p className="rounded-lg border border-cyan-300/20 bg-cyan-500/10 px-3 py-2">Policies: {entry.triggeredPolicies.join(" | ")}</p>
                ) : null}
                {entry.riskFindings.length ? (
                  <p className="rounded-lg border border-amber-300/20 bg-amber-500/10 px-3 py-2">Risk: {entry.riskFindings.join(" | ")}</p>
                ) : null}
                <p className="inline-flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]"><ScrollText className="h-3.5 w-3.5" /> Evidence ID: {entry.id}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
