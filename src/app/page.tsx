import { Shield, Wallet, AlertTriangle, BadgeCheck } from "lucide-react";

import { DecisionBadge } from "@/components/decision-badge";
import { WalletStatusCard } from "@/components/wallet-status-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { defaultPolicyConfig } from "@/lib/policy/engine";
import { demoScenarios } from "@/lib/scenarios/seed";

const kpis = [
  { label: "Policy Rules Active", value: "12", icon: Shield, sub: "Domain, spend, and tool guardrails" },
  { label: "Scenario Pack", value: `${demoScenarios.length}`, icon: BadgeCheck, sub: "Demo-ready decision journeys" },
  { label: "Risk Threshold", value: `${defaultPolicyConfig.riskThreshold}`, icon: AlertTriangle, sub: "Require approval above this score" },
  { label: "Wallet Network", value: "Stellar Testnet", icon: Wallet, sub: "Real payment path enabled" },
];

export default function OverviewPage() {
  return (
    <main className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label}>
              <CardHeader>
                <CardDescription>{item.label}</CardDescription>
                <CardTitle className="flex items-center justify-between text-2xl">
                  {item.value}
                  <Icon className="h-5 w-5 text-blue-300" />
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-[hsl(var(--muted-foreground))]">{item.sub}</CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Fortexa Control Plane</CardTitle>
            <CardDescription>
              Every autonomous payment or paid tool call is intercepted, scored, and policy checked before execution.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-[hsl(var(--muted-foreground))]">
            <p>1) Agent proposes an economic action.</p>
            <p>2) Policy engine validates domain/tool/budget constraints.</p>
            <p>3) Security analyzer inspects endpoint and prompt/output risks.</p>
            <p>4) Decision engine returns APPROVE, WARN, REQUIRE_APPROVAL, or BLOCK with explanation.</p>
            <p>5) Approved actions can execute a Stellar testnet payment path.</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Expected Demo Outcomes</CardTitle>
            <CardDescription>Scenario-to-decision mapping for judges.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {demoScenarios.map((scenario) => (
              <div key={scenario.id} className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] p-2">
                <span>{scenario.title}</span>
                <DecisionBadge decision={scenario.expectedDecision} />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <WalletStatusCard />
    </main>
  );
}
