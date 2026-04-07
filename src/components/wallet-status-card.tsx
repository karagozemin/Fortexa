"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { truncateMiddle } from "@/lib/utils/format";

type WalletData = {
  configured: boolean;
  userId?: string;
  source?: "freighter";
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

  async function fundWallet() {
    setLoading(true);
    try {
      const response = await fetch("/api/stellar/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || payload.error) {
        setStatus(payload.error ?? "Funding failed.");
      } else {
        setStatus("Friendbot funding requested successfully.");
        await loadWallet();
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Funding request failed.");
    } finally {
      setLoading(false);
    }
  }

  async function connectFreighter() {
    setLoading(true);
    try {
      const { requestAccess } = await import("@stellar/freighter-api");
      const access = await requestAccess();

      if (!access.address) {
        setStatus(access.error ?? "Freighter bağlantısı başarısız.");
        return;
      }

      const response = await fetch("/api/stellar/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: access.address,
          fund: true,
        }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok || payload.error) {
        setStatus(payload.error ?? "Freighter adresi bağlanamadı.");
        return;
      }

      setStatus(payload.message ?? "Freighter cüzdanı bağlandı.");
      await loadWallet();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Freighter bağlantı hatası.");
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
        <CardTitle>Agent Wallet Layer</CardTitle>
        <CardDescription>Stellar testnet identity, balance, and faucet funding for demo execution.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex gap-2">
          <Button variant="outline" onClick={connectFreighter} disabled={loading}>Connect Freighter</Button>
          <Button onClick={loadWallet} disabled={loading}>Refresh Wallet</Button>
          <Button variant="secondary" onClick={fundWallet} disabled={loading}>Fund via Friendbot</Button>
        </div>

        {data?.publicKey ? (
          <div className="rounded-xl border border-[hsl(var(--border))] p-3">
            <p className="text-[hsl(var(--muted-foreground))]">Public Key</p>
            <p className="font-mono text-xs">{truncateMiddle(data.publicKey, 14, 14)}</p>
            {data.userId ? <p className="mt-2 text-[hsl(var(--muted-foreground))]">Assigned User: {truncateMiddle(data.userId, 8, 8)}</p> : null}
            {data.source ? <p className="text-[hsl(var(--muted-foreground))]">Source: {data.source}</p> : null}
            <p className="mt-2 text-[hsl(var(--muted-foreground))]">Balance: {data.balance ?? "0"} XLM</p>
            {data.network ? <p className="text-[hsl(var(--muted-foreground))]">Network: {data.network}</p> : null}
          </div>
        ) : null}

        <Alert className="border-blue-500/40 bg-blue-500/10">
          <AlertTitle>Wallet status</AlertTitle>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
