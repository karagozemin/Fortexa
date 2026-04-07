"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, mfaCode: mfaCode.trim() || undefined }),
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
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Fortexa Login</CardTitle>
        <CardDescription>Use operator/viewer credentials from your env configuration.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="operator@fortexa.local"
            required
          />
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="password"
            required
          />
          <Input
            type="text"
            value={mfaCode}
            onChange={(event) => setMfaCode(event.target.value)}
            placeholder="MFA code (optional if enabled)"
          />
          <Button type="submit" disabled={loading} className="w-full">
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
