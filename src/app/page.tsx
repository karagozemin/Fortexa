import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  CircuitBoard,
  FileLock2,
  Hand,
  OctagonX,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const decisions = [
  {
    title: "APPROVE",
    tone: "border-emerald-300/30 bg-emerald-500/10",
    icon: CheckCircle2,
    text: "Policy and risk posture are acceptable. Wallet-native flow can continue.",
  },
  {
    title: "WARN",
    tone: "border-amber-300/30 bg-amber-500/10",
    icon: TriangleAlert,
    text: "Execution is allowed with elevated caution and expanded audit rationale.",
  },
  {
    title: "REQUIRE_APPROVAL",
    tone: "border-violet-300/30 bg-violet-500/10",
    icon: Hand,
    text: "Automation pauses until operator intent is explicitly confirmed.",
  },
  {
    title: "BLOCK",
    tone: "border-rose-300/30 bg-rose-500/10",
    icon: OctagonX,
    text: "Policy or risk controls reject economic execution before transaction submission.",
  },
];

const previewRoutes = [
  { title: "Decision Console", desc: "Live decision chamber for policy/risk findings and signed XDR execution.", href: "/console" },
  { title: "Audit Activity", desc: "Structured evidence timeline for what happened and why.", href: "/activity" },
  { title: "Policies", desc: "Deterministic controls, thresholds, and version rollback operations.", href: "/policies" },
  { title: "Wallet", desc: "Wallet-bound identity and signing boundary verification.", href: "/wallet" },
  { title: "Ops", desc: "Real-time telemetry for reliability and execution confidence.", href: "/ops" },
];

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 md:px-8 md:pt-10">
      <section className="premium-panel relative overflow-hidden rounded-3xl px-6 py-8 md:px-10 md:py-12">
        <div className="absolute -left-24 -top-20 h-60 w-60 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-60 w-60 rounded-full bg-indigo-500/15 blur-3xl" />

        <div className="relative grid gap-8 xl:grid-cols-2">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.25)] p-2 pr-4">
              <Image src="/fortexa-logo.jpeg" alt="Fortexa logo" width={56} height={56} className="h-14 w-14 rounded-xl" priority />
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">Fortexa</p>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Agentic Payment Firewall</p>
              </div>
            </div>
            
            
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-white md:text-6xl">
              The Payment Firewall for Autonomous Agent Actions on Stellar
            </h1>
            <p className="max-w-2xl text-base text-[hsl(var(--muted-foreground))] md:text-lg">
              Fortexa sits between agent intent and economic execution, enforces policy and risk controls, and permits only wallet-native signed transaction flow with full audit evidence.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link href="/overview" className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950">
                Launch Mission Console <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#architecture" className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] px-4 py-2.5 text-sm text-[hsl(var(--foreground))]">
                See Trust Architecture
              </a>
            </div>
          </div>

          <Card className="overflow-hidden border-cyan-300/20 bg-[linear-gradient(180deg,rgba(12,22,42,0.88),rgba(8,14,28,0.86))]">
            <CardHeader>
              <CardDescription>Product Preview</CardDescription>
              <CardTitle className="text-xl">Decision Chamber Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[hsl(var(--muted-foreground))]">
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] p-3">
                <p className="mb-2 inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-cyan-200"><BrainCircuit className="h-4 w-4" /> Agent Proposal</p>
                <p>“Transfer 42 XLM for premium market data query settlement.”</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[hsl(var(--border))] p-3">
                  <p className="mb-1 text-xs uppercase tracking-[0.18em] text-cyan-200">Policy Findings</p>
                  <p>Domain allowlist pass · daily cap posture safe.</p>
                </div>
                <div className="rounded-xl border border-amber-300/25 bg-amber-500/10 p-3">
                  <p className="mb-1 text-xs uppercase tracking-[0.18em] text-amber-200">Risk Findings</p>
                  <p>Low confidence anomaly, operator visibility recommended.</p>
                </div>
              </div>
              <div className="rounded-xl border border-violet-300/30 bg-violet-500/10 p-3 text-violet-100">
                Decision: REQUIRE_APPROVAL → wallet-sign path locked until operator confirms.
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="section-divider mt-14 pt-12">
        <div className="mb-7 max-w-3xl space-y-3">
          <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">Why This Matters</p>
          <h2 className="text-3xl font-semibold md:text-4xl">When agents control money, safety cannot be optional.</h2>
          <p className="text-[hsl(var(--muted-foreground))]">
            Autonomous systems now trigger real economic outcomes. Without hard controls, model errors become financial errors. Fortexa introduces policy, risk scoring, operator approvals, and immutable decision evidence before transaction submission.
          </p>
        </div>
      </section>

      <section className="section-divider mt-10 pt-12">
        <div className="mb-7 max-w-3xl space-y-3">
          <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">How It Works</p>
          <h2 className="text-3xl font-semibold md:text-4xl">Deterministic control loop from intent to settlement.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            "Agent proposes payment intent",
            "Fortexa evaluates policy and risk",
            "Decision and rationale returned",
            "Wallet signs and submits if allowed",
          ].map((step, index) => (
            <Card key={step} className="premium-panel">
              <CardHeader>
                <CardDescription>Step {index + 1}</CardDescription>
                <CardTitle className="text-lg">{step}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="section-divider mt-10 pt-12">
        <div className="mb-7 max-w-3xl space-y-3">
          <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">Decision States</p>
          <h2 className="text-3xl font-semibold md:text-4xl">Four explicit outcomes. No ambiguous execution behavior.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {decisions.map((decision) => {
            const Icon = decision.icon;
            return (
              <Card key={decision.title} className={decision.tone}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-lg">
                    {decision.title}
                    <Icon className="h-5 w-5" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-[hsl(var(--muted-foreground))]">{decision.text}</CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section id="architecture" className="section-divider mt-10 pt-12">
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3 premium-panel">
            <CardHeader>
              <CardDescription>Trust Layer Snapshot</CardDescription>
              <CardTitle className="text-2xl">Architecture boundary is explicit and auditable.</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-[hsl(var(--muted-foreground))] md:grid-cols-2">
              <div className="rounded-xl border border-[hsl(var(--border))] p-3">
                <p className="mb-1 text-xs uppercase tracking-[0.18em] text-cyan-200">Browser / Agent</p>
                <p>Proposes actions, receives decisions, and requests wallet signatures.</p>
              </div>
              <div className="rounded-xl border border-[hsl(var(--border))] p-3">
                <p className="mb-1 text-xs uppercase tracking-[0.18em] text-cyan-200">Fortexa Control Plane</p>
                <p>Policy engine, risk analyzer, decision engine, and evidence persistence.</p>
              </div>
              <div className="rounded-xl border border-cyan-300/25 bg-cyan-500/10 p-3 text-cyan-100">
                <p className="mb-1 text-xs uppercase tracking-[0.18em] text-cyan-200">Wallet Signing Boundary</p>
                <p>No server-side signing. XDR signatures remain client-side wallet-native.</p>
              </div>
              <div className="rounded-xl border border-[hsl(var(--border))] p-3">
                <p className="mb-1 text-xs uppercase tracking-[0.18em] text-cyan-200">Stellar + Audit Trail</p>
                <p>Signed transaction submits to Stellar; outcome and rationale are auditable.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 premium-panel">
            <CardHeader>
              <CardDescription>Core Capabilities</CardDescription>
              <CardTitle className="text-2xl">Built for real economic automation.</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[hsl(var(--muted-foreground))]">
              {[
                "Wallet-bound execution model",
                "Policy engine and guardrails",
                "Risk scoring and findings",
                "Operator approval flow",
                "Stellar-native signed XDR path",
                "Audit-grade evidence logging",
              ].map((item) => (
                <p key={item} className="rounded-lg border border-[hsl(var(--border))] px-3 py-2">{item}</p>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="section-divider mt-10 pt-12">
        <div className="mb-7 max-w-3xl space-y-3">
          <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">Product Preview</p>
          <h2 className="text-3xl font-semibold md:text-4xl">Live product surfaces, not marketing fiction.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {previewRoutes.map((route) => (
            <Link key={route.href} href={route.href}>
              <Card className="premium-panel h-full transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-cyan-500/5">
                <CardHeader>
                  <CardTitle>{route.title}</CardTitle>
                  <CardDescription>{route.desc}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="section-divider mt-10 pt-12">
        <Card className="premium-panel overflow-hidden border-cyan-300/20 bg-[linear-gradient(180deg,rgba(13,26,49,0.9),rgba(8,14,26,0.86))]">
          <CardHeader>
            <CardTitle className="text-3xl md:text-4xl">Fortexa makes autonomous finance governable.</CardTitle>
            <CardDescription className="text-base">Move fast with agents without losing control over economic execution.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link href="/overview" className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950">
              Open App <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] px-4 py-2.5 text-sm">
              Connect Wallet
            </Link>
          </CardContent>
        </Card>
      </section>

      <footer className="mt-12 border-t border-[hsl(var(--border))] pt-6 text-sm text-[hsl(var(--muted-foreground))]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-2"><CircuitBoard className="h-4 w-4" /> Fortexa · Policy-Controlled Payment Firewall</p>
          <p className="inline-flex items-center gap-1"><FileLock2 className="h-4 w-4" /> Wallet-native trust boundary on Stellar</p>
        </div>
      </footer>
    </main>
  );
}
