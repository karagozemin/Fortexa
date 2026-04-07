import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { defaultPolicyConfig } from "@/lib/policy/engine";

function RuleList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {items.map((item) => (
          <div key={item} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] p-2">
            {item}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function PoliciesPage() {
  return (
    <main className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Policy Engine Rules</CardTitle>
          <CardDescription>Programmable limits and allow/block controls that govern autonomous agent payments.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-[hsl(var(--border))] p-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Per-transaction cap</p>
            <p className="text-xl font-semibold">{defaultPolicyConfig.perTxCapXLM} XLM</p>
          </div>
          <div className="rounded-xl border border-[hsl(var(--border))] p-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Daily spending cap</p>
            <p className="text-xl font-semibold">{defaultPolicyConfig.dailyCapXLM} XLM</p>
          </div>
          <div className="rounded-xl border border-[hsl(var(--border))] p-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Max tool calls/day</p>
            <p className="text-xl font-semibold">{defaultPolicyConfig.maxToolCallsPerDay}</p>
          </div>
          <div className="rounded-xl border border-[hsl(var(--border))] p-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Risk score threshold</p>
            <p className="text-xl font-semibold">{defaultPolicyConfig.riskThreshold}</p>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <RuleList title="Allowed domains" items={defaultPolicyConfig.allowedDomains} />
        <RuleList title="Blocked domains" items={defaultPolicyConfig.blockedDomains} />
        <RuleList title="Allowed tools" items={defaultPolicyConfig.allowedTools} />
        <RuleList title="Blocked tools" items={defaultPolicyConfig.blockedTools} />
      </section>
    </main>
  );
}
