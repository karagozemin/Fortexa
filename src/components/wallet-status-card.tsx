"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { truncateMiddle } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type WalletData = {
  configured: boolean;
  userId?: string;
  source?: "external";
  provider?: string;
  publicKey?: string;
  balance?: string;
  message?: string;
  error?: string;
  network?: string;
};

export function WalletStatusCard({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadWallet() {
    setLoading(true);
    try {
      const response = await fetch("/api/stellar/balance");
      const payload = (await response.json()) as WalletData;
      setData(payload);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWallet();
  }, []);

  if (compact) {
    return (
      <div className="surface-elevated flex items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--accent)/0.1)]">
            <Wallet className="h-5 w-5 text-[hsl(var(--accent))]" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Session wallet</p>
            {data?.publicKey ? (
              <p className="font-mono text-sm">{truncateMiddle(data.publicKey, 8, 8)}</p>
            ) : (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Not linked</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Balance</p>
          <p className="text-lg font-semibold">{data?.balance ?? "—"} <span className="text-sm font-normal text-[hsl(var(--muted-foreground))]">XLM</span></p>
        </div>
        <Button variant="ghost" size="sm" onClick={loadWallet} disabled={loading} className="shrink-0">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>
    );
  }

  return (
    <div className="surface-elevated p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Wallet layer</p>
          <p className="text-lg font-semibold">Agent wallet</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadWallet} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {data?.publicKey ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-[hsl(var(--muted)/0.4)] p-4">
            <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Public key</p>
            <p className="mt-1 font-mono text-xs">{truncateMiddle(data.publicKey, 14, 14)}</p>
          </div>
          <div className="rounded-xl bg-[hsl(var(--muted)/0.4)] p-4">
            <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Balance</p>
            <p className="mt-1 text-xl font-semibold">{data.balance ?? "0"} <span className="text-sm font-normal">XLM</span></p>
          </div>
          {data.network ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))] sm:col-span-2">Network: {data.network}</p>
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90">
          {data?.error ?? data?.message ?? "No wallet linked. Sign in with Freighter to bind your session wallet."}
        </p>
      )}
    </div>
  );
}
