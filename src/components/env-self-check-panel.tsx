"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type CheckItem = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
};

type SelfCheckResponse = {
  timestamp: string;
  environment: string;
  checks: CheckItem[];
};

function StatusIcon({ status }: { status: CheckItem["status"] }) {
  switch (status) {
    case "pass":
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case "warn":
      return <AlertTriangle className="h-4 w-4 text-amber-400" />;
    case "fail":
      return <XCircle className="h-4 w-4 text-rose-400" />;
  }
}

function StatusBadge({ status }: { status: CheckItem["status"] }) {
  const variant = status === "pass" ? "approve" : status === "warn" ? "warn" : "block";
  return <Badge variant={variant}>{status.toUpperCase()}</Badge>;
}

export function EnvSelfCheckPanel() {
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/self-check", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Self-check fetch failed: ${response.status}`);
        }
        const data = (await response.json()) as SelfCheckResponse;
        if (cancelled) {
          return;
        }
        setChecks(data.checks);
        setEnvironment(data.environment);
        setTimestamp(data.timestamp);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>Environment Self-Check</span>
          {environment ? <Badge variant="info">{environment}</Badge> : null}
        </CardTitle>
        <CardDescription>
          Read-only verification of frontend and deployment configuration. Does not block the app.
          {timestamp ? <span className="ml-2 font-mono text-xs">Updated: {new Date(timestamp).toLocaleTimeString()}</span> : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-rose-300">Failed to load self-check: {error}</p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Running checks...
          </div>
        ) : (
          <div className="w-full overflow-hidden rounded-xl border border-[hsl(var(--border))]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Check</th>
                  <th className="px-4 py-2.5 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border)/0.6)]">
                {checks.map((check) => (
                  <tr key={check.id} className="transition-colors hover:bg-[hsl(var(--muted)/0.25)]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusIcon status={check.status} />
                        <StatusBadge status={check.status} />
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{check.label}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[hsl(var(--muted-foreground))]">{check.detail ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
