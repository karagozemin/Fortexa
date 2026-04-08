"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, Wallet, Bot, FileSearch, ScrollText, Activity, Lock, ChevronRight } from "lucide-react";

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
  const { email, role, isViewer } = useAuthSession();

  const identityLabel = email?.startsWith("wallet:") ? truncateMiddle(email.slice("wallet:".length), 8, 8) : email;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (isPublicRoute) {
    return <>{children}</>;
  }

  return (
    <div className="fortexa-shell mx-auto min-h-screen max-w-7xl px-4 pb-12 pt-6 md:px-8">
      <header className="glass-panel mb-8 overflow-hidden rounded-2xl p-5 md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/90">Fortexa Mission Control</p>
            <h1 className="text-2xl font-semibold md:text-[1.9rem]">Policy Firewall for Agentic Payments</h1>
            <p className="max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">
              Evaluate intent, enforce policy, and permit wallet-signed Stellar execution only when risk posture is acceptable.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--muted-foreground))] transition hover:text-white">
              Public site <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <nav className="flex flex-wrap gap-2.5">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href === "/overview" && pathname === "/app");
            const Icon = item.icon;

            return (
              <Link
                href={item.href}
                key={item.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                  active
                    ? "border-cyan-300/45 bg-cyan-500/20 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.45)] text-[hsl(var(--muted-foreground))] hover:border-cyan-300/30 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                {isViewer && writeSensitivePages.has(item.href) ? (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                    read-only
                  </span>
                ) : null}
              </Link>
            );
          })}
          </nav>

          <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            {email ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] px-2.5 py-1">
                  <Lock className="h-3.5 w-3.5" />
                  {identityLabel} {role ? `(${role})` : ""}
                </span>
                <Button variant="outline" size="sm" onClick={logout}>
                  Logout
                </Button>
              </>
            ) : (
              <Link href="/login" className="underline-offset-2 hover:underline">
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
