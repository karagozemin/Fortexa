import { Shield, Wallet, AlertTriangle, BadgeCheck, Activity, Lock, ShieldCheck } from "lucide-react";

import { DecisionBadge } from "@/components/decision-badge";
import { WalletStatusCard } from "@/components/wallet-status-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { defaultPolicyConfig } from "@/lib/policy/engine";
import { demoScenarios } from "@/lib/scenarios/seed";

const kpis = [
  { label: "Policy Guards", value: "12", icon: Shield, sub: "Domain, tool, spend, and threshold rules active." },
  { label: "Scenario Library", value: `${demoScenarios.length}`, icon: BadgeCheck, sub: "Curated decision journeys ready for demos." },
  { label: "Risk Threshold", value: `${defaultPolicyConfig.riskThreshold}`, icon: AlertTriangle, sub: "Manual approval threshold currently enforced." },
  { label: "Execution Network", value: "Stellar Testnet", icon: Wallet, sub: "Wallet-native signed XDR execution path." },
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
                  <Icon className="h-5 w-5 text-cyan-300" />
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
            <CardDescription>Command Center</CardDescription>
            <CardTitle>Fortexa Decision Loop</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-[hsl(var(--muted-foreground))]">
            <p className="rounded-lg border border-[hsl(var(--border))] px-3 py-2">1) Agent proposes an action with destination, tool intent, and spend amount.</p>
            <p className="rounded-lg border border-[hsl(var(--border))] px-3 py-2">2) Policy engine enforces domains, tools, budget caps, and deterministic rules.</p>
            <p className="rounded-lg border border-[hsl(var(--border))] px-3 py-2">3) Security analyzer computes risk findings and score for control posture.</p>
            <p className="rounded-lg border border-[hsl(var(--border))] px-3 py-2">4) Decision engine returns explicit outcome plus traceable explanation.</p>
            <p className="rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 text-cyan-100">5) Only allowed flows proceed to wallet-signed Stellar transaction submission.</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardDescription>Live Posture</CardDescription>
            <CardTitle>System Signals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] p-2">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan-300" /> Policy Engine</span>
              <span className="text-cyan-200">Online</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] p-2">
              <span className="inline-flex items-center gap-2"><Activity className="h-4 w-4 text-cyan-300" /> Audit Pipeline</span>
              <span className="text-cyan-200">Recording</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] p-2">
              <span className="inline-flex items-center gap-2"><Lock className="h-4 w-4 text-cyan-300" /> Signing Model</span>
              <span className="text-cyan-200">Wallet-bound</span>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardDescription>Recent Scenario Expectations</CardDescription>
            <CardTitle>Decision Coverage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {demoScenarios.map((scenario) => (
              <div key={scenario.id} className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] p-2">
                <div>
                  <p className="font-medium">{scenario.title}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{scenario.description}</p>
                </div>
                <DecisionBadge decision={scenario.expectedDecision} />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <WalletStatusCard />
        </div>
      </section>
    </main>
  );
}
