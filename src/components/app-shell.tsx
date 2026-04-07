"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, Wallet, Bot, FileSearch, ScrollText } from "lucide-react";

import { cn } from "@/lib/utils/cn";

const navItems = [
  { href: "/", label: "Overview", icon: ShieldCheck },
  { href: "/wallet", label: "Agent Wallet", icon: Wallet },
  { href: "/policies", label: "Policies", icon: FileSearch },
  { href: "/console", label: "Decision Console", icon: Bot },
  { href: "/scenarios", label: "Scenarios", icon: Wallet },
  { href: "/activity", label: "Audit Trail", icon: ScrollText },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-5 pb-10 pt-8">
      <header className="mb-7 flex flex-col gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/0.6)] p-5 backdrop-blur-lg md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-blue-300">Fortexa</p>
          <h1 className="text-2xl font-semibold">Agent Payment Firewall on Stellar</h1>
        </div>
        <nav className="flex flex-wrap gap-2">
          {navItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                href={item.href}
                key={item.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                  active
                    ? "border-blue-400/50 bg-blue-500/20 text-blue-200"
                    : "border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] text-[hsl(var(--muted-foreground))] hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </div>
  );
}
