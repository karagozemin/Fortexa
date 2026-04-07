"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PolicyConfig } from "@/lib/types/domain";

type PolicyResponse = {
  policy?: PolicyConfig;
  updatedAt?: string | null;
  error?: string;
};

function listToText(list: string[]) {
  return list.join("\n");
}

function textToList(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function PolicyEditor() {
  const [policy, setPolicy] = useState<PolicyConfig | null>(null);
  const [allowedDomains, setAllowedDomains] = useState("");
  const [blockedDomains, setBlockedDomains] = useState("");
  const [allowedTools, setAllowedTools] = useState("");
  const [blockedTools, setBlockedTools] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Loading policy...");
  const [loading, setLoading] = useState(false);

  async function loadPolicy() {
    setLoading(true);
    try {
      const response = await fetch("/api/policy", { cache: "no-store" });
      const payload = (await response.json()) as PolicyResponse;

      if (!response.ok || payload.error || !payload.policy) {
        setStatus(payload.error ?? "Failed to load policy.");
        return;
      }

      setPolicy(payload.policy);
      setAllowedDomains(listToText(payload.policy.allowedDomains));
      setBlockedDomains(listToText(payload.policy.blockedDomains));
      setAllowedTools(listToText(payload.policy.allowedTools));
      setBlockedTools(listToText(payload.policy.blockedTools));
      setUpdatedAt(payload.updatedAt ?? null);
      setStatus("Policy loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unexpected policy load error.");
    } finally {
      setLoading(false);
    }
  }

  async function savePolicy() {
    if (!policy) {
      setStatus("Policy is not loaded yet.");
      return;
    }

    setLoading(true);
    try {
      const nextPolicy: PolicyConfig = {
        ...policy,
        allowedDomains: textToList(allowedDomains),
        blockedDomains: textToList(blockedDomains),
        allowedTools: textToList(allowedTools),
        blockedTools: textToList(blockedTools),
      };

      const response = await fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextPolicy),
      });

      const payload = (await response.json()) as PolicyResponse;

      if (!response.ok || payload.error || !payload.policy) {
        setStatus(payload.error ?? "Failed to save policy.");
        return;
      }

      setPolicy(payload.policy);
      setUpdatedAt(payload.updatedAt ?? null);
      setStatus("Policy updated successfully.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unexpected policy save error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPolicy();
  }, []);

  return (
    <main className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Policy Engine Rules</CardTitle>
          <CardDescription>View and edit active policy config used by decision engine.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-[hsl(var(--border))] p-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Per-transaction cap</p>
            <Input
              type="number"
              value={policy?.perTxCapXLM ?? 0}
              onChange={(event) =>
                setPolicy((prev) => (prev ? { ...prev, perTxCapXLM: Number(event.target.value) || 0 } : prev))
              }
            />
          </div>
          <div className="rounded-xl border border-[hsl(var(--border))] p-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Daily spending cap</p>
            <Input
              type="number"
              value={policy?.dailyCapXLM ?? 0}
              onChange={(event) =>
                setPolicy((prev) => (prev ? { ...prev, dailyCapXLM: Number(event.target.value) || 0 } : prev))
              }
            />
          </div>
          <div className="rounded-xl border border-[hsl(var(--border))] p-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Max tool calls/day</p>
            <Input
              type="number"
              value={policy?.maxToolCallsPerDay ?? 0}
              onChange={(event) =>
                setPolicy((prev) => (prev ? { ...prev, maxToolCallsPerDay: Number(event.target.value) || 0 } : prev))
              }
            />
          </div>
          <div className="rounded-xl border border-[hsl(var(--border))] p-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Risk score threshold</p>
            <Input
              type="number"
              value={policy?.riskThreshold ?? 0}
              onChange={(event) =>
                setPolicy((prev) => (prev ? { ...prev, riskThreshold: Number(event.target.value) || 0 } : prev))
              }
            />
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Allowed domains</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              className="min-h-32 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] px-3 py-2 text-sm"
              value={allowedDomains}
              onChange={(event) => setAllowedDomains(event.target.value)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Blocked domains</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              className="min-h-32 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] px-3 py-2 text-sm"
              value={blockedDomains}
              onChange={(event) => setBlockedDomains(event.target.value)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Allowed tools</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              className="min-h-32 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] px-3 py-2 text-sm"
              value={allowedTools}
              onChange={(event) => setAllowedTools(event.target.value)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Blocked tools</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              className="min-h-32 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] px-3 py-2 text-sm"
              value={blockedTools}
              onChange={(event) => setBlockedTools(event.target.value)}
            />
          </CardContent>
        </Card>
      </section>

      <div className="flex gap-2">
        <Button onClick={savePolicy} disabled={loading}>Save Policy</Button>
        <Button variant="outline" onClick={loadPolicy} disabled={loading}>Reload</Button>
      </div>

      <Alert className="border-blue-500/40 bg-blue-500/10">
        <AlertTitle>Policy status</AlertTitle>
        <AlertDescription>
          {status}
          {updatedAt ? ` Last updated: ${updatedAt}` : ""}
        </AlertDescription>
      </Alert>
    </main>
  );
}
