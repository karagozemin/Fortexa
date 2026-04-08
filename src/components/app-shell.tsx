"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ShieldCheck, Wallet, Bot, FileSearch, ScrollText, Activity, Lock, ChevronRight, Radar, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/auth/use-auth-session";

import { cn } from "@/lib/utils/cn";
import { truncateMiddle } from "@/lib/utils/format";

const navItems = [
  { href: "/overview", label: "Overview", icon: ShieldCheck },
  { href: "/wallet", label: "Agent Wallet", icon: Wallet },
  { href: "/policies", label: "Policies", icon: FileSearch },
  { href: "/console", label: "Decision Console", icon: Bot },
  { href: "/scenarios", label: "Scenarios", icon: Bot },
  { href: "/activity", label: "Audit Trail", icon: ScrollText },
  { href: "/ops", label: "Ops", icon: Activity },
];

const writeSensitivePages = new Set(["/policies", "/console", "/ops"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicRoute = pathname === "/" || pathname === "/login";
  const { email, role, isViewer, authenticated, loading } = useAuthSession();

  const identityLabel = email
    ? email.startsWith("wallet:")
      ? truncateMiddle(email.slice("wallet:".length), 8, 8)
      : email
    : "wallet-session";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (isPublicRoute) {
    return <>{children}</>;
  }

  return (
    <div className="fortexa-shell mx-auto min-h-screen max-w-7xl px-3 pb-10 pt-4 md:px-6">
      <div className="app-frame flex min-h-[calc(100vh-2rem)] overflow-hidden rounded-3xl">
        <aside className="hidden w-70 border-r border-[hsl(var(--border))] bg-[linear-gradient(180deg,rgba(10,17,30,0.95),rgba(7,12,22,0.95))] p-5 lg:flex lg:flex-col">
          <div className="mb-8">
            <div className="mb-3 inline-flex items-center gap-3">
              <Image src="/fortexa-logo.jpeg" alt="Fortexa logo" width={52} height={52} className="h-13 w-13 rounded-xl" priority />
              <div>
                <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-300">Fortexa</p>
                <h2 className="text-xl font-semibold">Mission Console</h2>
              </div>
            </div>
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
              Policy decisioning layer between AI intent and Stellar execution.
            </p>
          </div>

          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const active = pathname === item.href || (item.href === "/overview" && pathname === "/app");
              const Icon = item.icon;

              return (
                <Link
                  href={item.href}
                  key={item.href}
                  className={cn(
                    "group flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition",
                    active
                      ? "border-cyan-300/45 bg-cyan-500/15 text-cyan-100"
                      : "border-transparent text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.35)] hover:text-white"
                  )}
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  {isViewer && writeSensitivePages.has(item.href) ? (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">RO</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-3">
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.22)] p-3 text-xs text-[hsl(var(--muted-foreground))]">
              <p className="mb-1 inline-flex items-center gap-1 text-cyan-200"><Shield className="h-3.5 w-3.5" /> Wallet-native signing</p>
              <p>No server-side key custody.</p>
            </div>
            <Link href="/" className="inline-flex items-center gap-1 text-xs text-cyan-200 hover:text-cyan-100">
              Public site <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </aside>

        <div className="flex min-h-full flex-1 flex-col">
          <header className="border-b border-[hsl(var(--border))] px-4 py-4 md:px-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="inline-flex items-center gap-3">
                  <Image src="/fortexa-logo.jpeg" alt="Fortexa logo" width={40} height={40} className="h-10 w-10 rounded-lg" priority />
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">Mission Control</p>
                    <h1 className="text-xl font-semibold md:text-2xl">Autonomous Payment Security Plane</h1>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                <span className="hidden items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.28)] px-2.5 py-1 md:inline-flex">
                  <Radar className="h-3.5 w-3.5 text-cyan-300" /> Stellar Testnet
                </span>
                {loading ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] px-2.5 py-1">
                    Checking session...
                  </span>
                ) : authenticated ? (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] px-2.5 py-1">
                      <Lock className="h-3.5 w-3.5" />
                      {identityLabel} {role ? `(${role})` : ""}
                    </span>
                    <Button variant="outline" size="sm" onClick={logout}>Logout</Button>
                  </>
                ) : (
                  <Link href="/login" className="underline-offset-2 hover:underline">Login</Link>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:hidden">
              {navItems.map((item) => {
                const active = pathname === item.href || (item.href === "/overview" && pathname === "/app");
                const Icon = item.icon;
                return (
                  <Link
                    href={item.href}
                    key={item.href}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                      active
                        ? "border-cyan-300/45 bg-cyan-500/15 text-cyan-100"
                        : "border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.24)] text-[hsl(var(--muted-foreground))]"
                    )}
                  >
                    <Icon className="h-4 w-4" /> {item.label}
                    {isViewer && writeSensitivePages.has(item.href) ? (
                      <span className="ml-auto rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">RO</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </header>

          <main className="flex-1 px-4 py-5 md:px-6 md:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
