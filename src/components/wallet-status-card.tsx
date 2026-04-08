"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { truncateMiddle } from "@/lib/utils/format";

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

export function WalletStatusCard() {
  const [data, setData] = useState<WalletData | null>(null);
  const [status, setStatus] = useState<string>("Wallet not loaded yet.");
  const [loading, setLoading] = useState(false);

  async function loadWallet() {
    setLoading(true);
    try {
      const response = await fetch("/api/stellar/balance");
      const payload = (await response.json()) as WalletData;
      setData(payload);
      setStatus(payload.error ?? payload.message ?? "Wallet loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load wallet.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWallet();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardDescription>Wallet-Bound Identity</CardDescription>
        <CardTitle className="text-xl">Agent Wallet Layer</CardTitle>
        <CardDescription>Transaction source remains strictly bound to authenticated session wallet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex gap-2">
          <Button onClick={loadWallet} disabled={loading}>Refresh Wallet</Button>
        </div>

        {data?.publicKey ? (
          <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 p-3">
            <p className="text-[hsl(var(--muted-foreground))]">Public Key</p>
            <p className="font-mono text-xs">{truncateMiddle(data.publicKey, 14, 14)}</p>
            {data.userId ? <p className="mt-2 text-[hsl(var(--muted-foreground))]">Assigned User: {truncateMiddle(data.userId, 8, 8)}</p> : null}
            {data.source ? <p className="text-[hsl(var(--muted-foreground))]">Source: {data.source}</p> : null}
            {data.provider ? <p className="text-[hsl(var(--muted-foreground))]">Provider: {data.provider}</p> : null}
            <p className="mt-2 text-[hsl(var(--muted-foreground))]">Balance: {data.balance ?? "0"} XLM</p>
            {data.network ? <p className="text-[hsl(var(--muted-foreground))]">Network: {data.network}</p> : null}
          </div>
        ) : null}

        <Alert className="border-cyan-500/35 bg-cyan-500/10">
          <AlertTitle>Wallet status</AlertTitle>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
        {!data?.configured ? (
          <Alert className="border-amber-500/40 bg-amber-500/10">
            <AlertTitle>Wallet required</AlertTitle>
            <AlertDescription>No valid session wallet is linked. Log out and sign in again with your wallet.</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
