"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import type { PolicyConfig } from "@/lib/types/domain";

type PolicyResponse = {
  policy?: PolicyConfig;
  updatedAt?: string | null;
  version?: number;
  error?: string;
};

type PolicyHistoryResponse = {
  entries?: Array<{
    version: number;
    updatedAt: string;
    updatedBy?: string;
  }>;
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
  const { isOperator, loading: sessionLoading } = useAuthSession();
  const [policy, setPolicy] = useState<PolicyConfig | null>(null);
  const [allowedDomains, setAllowedDomains] = useState("");
  const [blockedDomains, setBlockedDomains] = useState("");
  const [allowedTools, setAllowedTools] = useState("");
  const [blockedTools, setBlockedTools] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [history, setHistory] = useState<Array<{ version: number; updatedAt: string; updatedBy?: string }>>([]);
  const [status, setStatus] = useState<string>("Loading policy...");
  const [loading, setLoading] = useState(false);

  const writeDisabled = loading || sessionLoading || !isOperator;

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
      setVersion(payload.version ?? null);
      setStatus("Policy loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unexpected policy load error.");
    } finally {
      setLoading(false);
    }
  }

  async function savePolicy() {
    if (!isOperator) {
      setStatus("Viewer role is read-only. Login as operator to update policy.");
      return;
    }

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
      setVersion(payload.version ?? null);
      setStatus("Policy updated successfully.");
      await loadHistory();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unexpected policy save error.");
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    try {
      const response = await fetch("/api/policy/history?limit=8", { cache: "no-store" });
      const payload = (await response.json()) as PolicyHistoryResponse;

      if (!response.ok || payload.error) {
        return;
      }

      setHistory(payload.entries ?? []);
    } catch {
      setHistory([]);
    }
  }

  async function rollback(versionToRollback: number) {
    if (!isOperator) {
      setStatus("Viewer role is read-only. Login as operator to rollback policy.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/policy/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetVersion: versionToRollback }),
      });

      const payload = (await response.json()) as PolicyResponse;

      if (!response.ok || payload.error || !payload.policy) {
        setStatus(payload.error ?? "Rollback failed.");
        return;
      }

      setPolicy(payload.policy);
      setAllowedDomains(listToText(payload.policy.allowedDomains));
      setBlockedDomains(listToText(payload.policy.blockedDomains));
      setAllowedTools(listToText(payload.policy.allowedTools));
      setBlockedTools(listToText(payload.policy.blockedTools));
      setUpdatedAt(payload.updatedAt ?? null);
      setVersion(payload.version ?? null);
      setStatus(`Rollback successful to version ${versionToRollback}.`);
      await loadHistory();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unexpected rollback error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPolicy();
    void loadHistory();
  }, []);

  return (
    <div className="space-y-6">
      {!sessionLoading && !isOperator ? (
        <Alert className="border-amber-500/40 bg-amber-500/10">
          <AlertTitle>Viewer mode</AlertTitle>
          <AlertDescription>Policy editing is disabled. Only operator role can update policy.</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Policy Engine Rules</CardTitle>
          <CardDescription>Edit active deterministic controls used by the decision engine.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-[hsl(var(--border))] p-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Current version</p>
            <p className="text-lg font-semibold">{version ?? "-"}</p>
          </div>
          <div className="rounded-xl border border-[hsl(var(--border))] p-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Per-transaction cap</p>
            <Input
              type="number"
              value={policy?.perTxCapXLM ?? 0}
              disabled={writeDisabled}
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
              disabled={writeDisabled}
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
              disabled={writeDisabled}
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
              disabled={writeDisabled}
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
              disabled={writeDisabled}
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
              disabled={writeDisabled}
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
              disabled={writeDisabled}
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
              disabled={writeDisabled}
              onChange={(event) => setBlockedTools(event.target.value)}
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Policy Version History</CardTitle>
          <CardDescription>Latest saved policy versions with optional rollback.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? <p className="text-sm text-[hsl(var(--muted-foreground))]">No history records.</p> : null}
          {history.map((entry) => (
            <div key={entry.version} className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] p-2 text-sm">
              <div>
                <p className="font-medium">v{entry.version}</p>
                <p className="text-[hsl(var(--muted-foreground))]">
                  {entry.updatedAt}
                  {entry.updatedBy ? ` • ${entry.updatedBy}` : ""}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={writeDisabled || version === entry.version}
                onClick={() => rollback(entry.version)}
              >
                Rollback
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={savePolicy} disabled={writeDisabled}>Save Policy</Button>
        <Button variant="outline" onClick={loadPolicy} disabled={loading}>Reload</Button>
        <Button variant="outline" onClick={loadHistory} disabled={loading}>Reload History</Button>
      </div>

      <Alert className="border-cyan-500/35 bg-cyan-500/10">
        <AlertTitle>Policy status</AlertTitle>
        <AlertDescription>
          {status}
          {updatedAt ? ` Last updated: ${updatedAt}` : ""}
        </AlertDescription>
      </Alert>
    </div>
  );
}
