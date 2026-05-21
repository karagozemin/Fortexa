"use client";

import Link from "next/link";

import { cn } from "@/lib/utils/cn";

export type TabItem = {
  id: string;
  label: string;
  href: string;
};

export function TabNav({ tabs, activeTab }: { tabs: TabItem[]; activeTab: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] p-1 fortexa-no-scrollbar">
      {tabs.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              "shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200",
              active
                ? "bg-[hsl(var(--accent)/0.12)] text-[hsl(var(--accent))] shadow-[0_0_0_1px_hsl(var(--accent)/0.25)]"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
