import Link from "next/link";
import {
  ShieldCheck,
  Wallet,
  Cpu,
  FileSearch,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  OctagonX,
  Hand,
  Sparkles,
  Workflow,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { demoScenarios } from "@/lib/scenarios/seed";

const decisionCards = [
  {
    title: "APPROVE",
    icon: CheckCircle2,
    style: "border-emerald-400/30 bg-emerald-500/10",
    text: "Policy constraints pass and risk posture is clean. Wallet-signed flow can proceed.",
  },
  {
    title: "WARN",
    icon: AlertTriangle,
    style: "border-amber-400/30 bg-amber-500/10",
    text: "Action is allowed with elevated caution signals. Fortexa records rationale and findings.",
  },
  {
    title: "REQUIRE_APPROVAL",
    icon: Hand,
    style: "border-violet-400/30 bg-violet-500/10",
    text: "Automation pauses for operator intent confirmation before any payment path can continue.",
  },
  {
    title: "BLOCK",
    icon: OctagonX,
    style: "border-rose-400/30 bg-rose-500/10",
    text: "High-confidence policy or risk violation. Economic execution is denied.",
  },
];

const capabilities = [
  "Wallet-bound execution model",
  "Deterministic policy engine",
  "Security risk analysis findings",
  "Audit evidence trail by decision",
  "Operator approval workflow",
  "Stellar-native signed XDR path",
];

const previews = [
  { title: "Decision Console", description: "Run action proposals through policy + risk, then execute signed transaction flow.", href: "/console" },
  { title: "Audit Activity", description: "Inspect exactly what happened, why it happened, and what controls were triggered.", href: "/activity" },
  { title: "Policy Surface", description: "Adjust caps, domains, tools, thresholds, and roll back safely with version history.", href: "/policies" },
  { title: "Wallet Layer", description: "Verify source wallet state and reinforce no server-side signing posture.", href: "/wallet" },
  { title: "Operations", description: "Monitor system health, request profile, and signed transaction throughput.", href: "/ops" },
];

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 md:px-8 md:pt-12">
      <section className="glass-panel relative overflow-hidden rounded-3xl px-6 py-8 md:px-10 md:py-12">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute -bottom-24 left-0 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-2 lg:items-end">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/35 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-200">
              <Sparkles className="h-3.5 w-3.5" />
              Fortexa Security Plane
            </div>
            <h1 className="text-4xl font-semibold leading-tight text-white md:text-6xl">
              Policy-Controlled Firewall for Autonomous Stellar Payments
            </h1>
            <p className="max-w-xl text-base text-[hsl(var(--muted-foreground))] md:text-lg">
              Fortexa sits between agent intent and economic execution, scoring risk, enforcing policy, and allowing only wallet-signed XDR flow with full audit evidence.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/overview" className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950">
                Open App <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#trust-architecture" className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] px-4 py-2 text-sm text-[hsl(var(--foreground))]">
                See How It Works <Workflow className="h-4 w-4" />
              </a>
            </div>
          </div>

          <Card className="border-cyan-300/20 bg-[linear-gradient(180deg,rgba(17,28,52,0.8),rgba(10,16,33,0.8))]">
            <CardHeader>
              <CardDescription>Execution Trust Path</CardDescription>
              <CardTitle className="text-xl">Intent → Decision → Signature → Settlement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[hsl(var(--muted-foreground))]">
              <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] px-3 py-2">
                <span>Agent proposes action</span>
                <Cpu className="h-4 w-4 text-cyan-200" />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] px-3 py-2">
                <span>Fortexa policy + risk evaluation</span>
                <ShieldCheck className="h-4 w-4 text-cyan-200" />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] px-3 py-2">
                <span>Wallet signs approved XDR</span>
                <Wallet className="h-4 w-4 text-cyan-200" />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] px-3 py-2">
                <span>Stellar testnet submit + audit evidence</span>
                <FileSearch className="h-4 w-4 text-cyan-200" />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="section-divider mt-14 pt-12">
        <div className="mb-6 max-w-3xl space-y-3">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Why This Matters</p>
          <h2 className="text-3xl font-semibold">Model mistakes become financial mistakes without controls.</h2>
          <p className="text-[hsl(var(--muted-foreground))]">
            Agentic systems can trigger real economic actions at machine speed. Fortexa inserts strict policy checks, risk scoring, human-approval gates, and auditability before money movement.
          </p>
        </div>
      </section>

      <section className="section-divider mt-10 pt-12" id="trust-architecture">
        <div className="mb-6 max-w-3xl space-y-3">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">How It Works</p>
          <h2 className="text-3xl font-semibold">A deterministic control loop for agent payments.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            "Agent proposes economic action",
            "Fortexa evaluates policy + risk",
            "Decision returned with explanation",
            "Wallet-signed execution if allowed",
          ].map((step, index) => (
            <Card key={step}>
              <CardHeader>
                <CardDescription>Step {index + 1}</CardDescription>
                <CardTitle className="text-lg">{step}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="section-divider mt-10 pt-12">
        <div className="mb-6 max-w-3xl space-y-3">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Decision States</p>
          <h2 className="text-3xl font-semibold">Four outcomes, explicit control posture.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {decisionCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title} className={card.style}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-lg">
                    {card.title}
                    <Icon className="h-5 w-5" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-[hsl(var(--muted-foreground))]">{card.text}</CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="section-divider mt-10 pt-12">
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardDescription>Product Capabilities</CardDescription>
              <CardTitle className="text-2xl">Control surfaces built for real economic automation.</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[hsl(var(--muted-foreground))]">
              {capabilities.map((capability) => (
                <p key={capability} className="rounded-lg border border-[hsl(var(--border))] px-3 py-2">
                  {capability}
                </p>
              ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardDescription>Trust Architecture</CardDescription>
              <CardTitle className="text-2xl">Browser/Wallet/Fortexa/Stellar boundaries are explicit.</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[hsl(var(--muted-foreground))]">
              <div className="rounded-xl border border-[hsl(var(--border))] p-3">
                Browser + Agent UI sends action proposal to Fortexa API boundary.
              </div>
              <div className="rounded-xl border border-[hsl(var(--border))] p-3">
                Fortexa evaluates policy and risk; returns APPROVE/WARN/REQUIRE_APPROVAL/BLOCK with evidence.
              </div>
              <div className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 p-3 text-cyan-100">
                No server-side signing: wallet signs XDR client-side; only signed payload is submitted.
              </div>
              <div className="rounded-xl border border-[hsl(var(--border))] p-3">Audit trail captures action, triggers, findings, decision, and transaction references.</div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="section-divider mt-10 pt-12">
        <div className="mb-6 max-w-3xl space-y-3">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Product Preview</p>
          <h2 className="text-3xl font-semibold">Real surfaces from the app, not mockups.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {previews.map((item) => (
            <Link key={item.title} href={item.href}>
              <Card className="h-full transition hover:border-cyan-300/30 hover:bg-cyan-500/5">
                <CardHeader>
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="section-divider mt-10 pt-12">
        <Card className="overflow-hidden border-cyan-300/25 bg-[linear-gradient(180deg,rgba(16,30,55,0.8),rgba(8,14,28,0.8))]">
          <CardHeader>
            <CardTitle className="text-3xl">Fortexa is the safety layer for autonomous economic action.</CardTitle>
            <CardDescription className="text-base">
              Move fast with agents without surrendering control over money movement.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link href="/overview" className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950">
              Launch App <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] px-4 py-2 text-sm">
              Connect Wallet
            </Link>
          </CardContent>
        </Card>
      </section>

      <footer className="mt-12 border-t border-[hsl(var(--border))] pt-6 text-sm text-[hsl(var(--muted-foreground))]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>Fortexa · Policy-Controlled Payment Firewall on Stellar</p>
          <p>{demoScenarios.length} demo scenarios available</p>
        </div>
      </footer>
    </main>
  );
}
