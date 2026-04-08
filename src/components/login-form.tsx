"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const [publicKey, setPublicKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function connectFreighter() {
    setLoading(true);
    setMessage(null);

    try {
      const { requestAccess } = await import("@stellar/freighter-api");
      const access = await requestAccess();

      if (!access.address) {
        setMessage(access.error ?? "Wallet connection failed.");
        return;
      }

      setPublicKey(access.address);
      setMessage("Wallet connected. You can sign in now.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected wallet connection error.");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!publicKey.trim()) {
      setMessage("Connect your wallet first.");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: publicKey.trim() }),
      });

      const payload = (await response.json()) as { error?: string; role?: string };

      if (!response.ok || payload.error) {
        setMessage(payload.error ?? "Login failed.");
        return;
      }

      setMessage(`Login successful (${payload.role ?? "unknown"}). Redirecting...`);
      router.push("/console");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected login error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md border-cyan-300/20 bg-[linear-gradient(180deg,rgba(16,27,50,0.82),rgba(9,14,27,0.85))]">
      <CardHeader>
        <CardDescription>Wallet-First Authentication</CardDescription>
        <CardTitle className="text-2xl">Fortexa Login</CardTitle>
        <CardDescription>Connect Freighter and establish a wallet-bound session.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <Button type="button" variant="outline" onClick={connectFreighter} disabled={loading} className="w-full">
            {loading ? "Connecting..." : "Connect Wallet"}
          </Button>
          <Input type="text" value={publicKey} placeholder="Connected wallet address will appear here" readOnly />
          <Button type="submit" disabled={loading || !publicKey.trim()} className="w-full">
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
        {message ? (
          <Alert className="mt-4 border-blue-500/40 bg-blue-500/10">
            <AlertTitle>Auth status</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
