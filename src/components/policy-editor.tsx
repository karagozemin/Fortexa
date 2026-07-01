"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import type { SimulationReport, SimulationSource } from "@/lib/decision/simulate";
import type { DecisionType, PolicyConfig } from "@/lib/types/domain";

type PolicyResponse = {
  policy?: PolicyConfig;
  updatedAt?: string | null;
  version?: number;
  error?: string;
};

type PolicyConflictResponse = {
  error?: string;
  code?: string;
  expectedVersion?: number;
  currentVersion?: number;
  currentUpdatedAt?: string | null;
};

type PolicyConflictState = {
  expectedVersion: number;
  currentVersion: number;
  currentUpdatedAt: string | null;
  message: string;
};

type PolicyHistoryEntry = {
  version: number;
  updatedAt: string;
  updatedBy?: string;
  policy?: PolicyConfig;
};

type PolicyHistoryResponse = {
  entries?: PolicyHistoryEntry[];
  error?: string;
};

type SimulationResponse = {
  report?: SimulationReport;
  auditSampled?: number;
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
  const [history, setHistory] = useState<PolicyHistoryEntry[]>([]);
  const [status, setStatus] = useState<string>("Loading policy...");
  const [loading, setLoading] = useState(false);
  const [diffA, setDiffA] = useState<number | null>(null);
  const [diffB, setDiffB] = useState<number | null>(null);
  const [includeAudit, setIncludeAudit] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulation, setSimulation] = useState<SimulationReport | null>(null);
  const [simStatus, setSimStatus] = useState<string | null>(null);
  const [conflict, setConflict] = useState<PolicyConflictState | null>(null);

  const writeDisabled = loading || sessionLoading || !isOperator;

  /** Assemble the unsaved draft policy from the current editor state. */
  function buildDraftPolicy(base: PolicyConfig): PolicyConfig {
    return {
      ...base,
      allowedDomains: textToList(allowedDomains),
      blockedDomains: textToList(blockedDomains),
      allowedTools: textToList(allowedTools),
      blockedTools: textToList(blockedTools),
    };
  }

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
      setConflict(null);
      setStatus("Policy loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unexpected policy load error.");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Pull the latest server version and replace the editor draft with it.
   * Used to recover from a 409 Conflict: the operator's local edits are
   * intentionally discarded so they can re-enter them against the new base.
   * Asks for an explicit confirmation so a misclick can't wipe out work.
   */
  async function discardLocalChangesAndReload() {
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const acknowledged = window.confirm(
        "Discard your unsaved policy edits and reload the current server version?",
      );
      if (!acknowledged) {
        return;
      }
    }

    setLoading(true);
    try {
      const response = await fetch("/api/policy", { cache: "no-store" });
      const payload = (await response.json()) as PolicyResponse;

      if (!response.ok || payload.error || !payload.policy) {
        setStatus(payload.error ?? "Reload failed — please try again.");
        return;
      }

      setPolicy(payload.policy);
      setAllowedDomains(listToText(payload.policy.allowedDomains));
      setBlockedDomains(listToText(payload.policy.blockedDomains));
      setAllowedTools(listToText(payload.policy.allowedTools));
      setBlockedTools(listToText(payload.policy.blockedTools));
      setUpdatedAt(payload.updatedAt ?? null);
      setVersion(payload.version ?? null);
      setConflict(null);
      setStatus("Reloaded latest policy from server. Local edits discarded — please re-enter your changes.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unexpected reload error.");
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
    setConflict(null);
    try {
      const nextPolicy = buildDraftPolicy(policy);
      // Send the version we loaded against so the server can detect another
      // operator's concurrent save. Missing it keeps the legacy behavior.
      const body = JSON.stringify({
        ...nextPolicy,
        ...(version !== null ? { expectedVersion: version } : {}),
      });

      const response = await fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (response.status === 409) {
        const conflictBody = (await response.json().catch(() => ({}))) as PolicyConflictResponse;
        const expectedVersion =
          conflictBody.expectedVersion ?? version ?? -1;
        const currentVersion = conflictBody.currentVersion ?? -1;
        setConflict({
          expectedVersion,
          currentVersion,
          currentUpdatedAt: conflictBody.currentUpdatedAt ?? null,
          message:
            conflictBody.error ??
            "Policy was changed by another operator. Please reload and retry.",
        });
        setStatus(
          `Conflict: server is at v${conflictBody.currentVersion ?? "?"}, your edit was based on v${
            conflictBody.expectedVersion ?? version ?? "?"
          }.`,
        );
        // Refresh history view in case the other operator's save landed.
        void loadHistory();
        return;
      }

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

  async function runSimulation() {
    if (!isOperator) {
      setSimStatus("Viewer role is read-only. Login as operator to simulate policy changes.");
      return;
    }

    if (!policy) {
      setSimStatus("Policy is not loaded yet.");
      return;
    }

    setSimulating(true);
    setSimStatus(null);
    try {
      const draftPolicy = buildDraftPolicy(policy);

      const response = await fetch("/api/policy/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy: draftPolicy, includeAudit }),
      });

      const payload = (await response.json()) as SimulationResponse;

      if (!response.ok || payload.error || !payload.report) {
        setSimulation(null);
        setSimStatus(payload.error ?? "Simulation failed. Check the policy values and try again.");
        return;
      }

      setSimulation(payload.report);

      const { changed, total } = payload.report.summary;
      const auditNote =
        includeAudit && (payload.auditSampled ?? 0) === 0
          ? " No recent audit actions were available to sample."
          : includeAudit
            ? ` Included ${payload.auditSampled} recent audit action(s).`
            : "";
      setSimStatus(
        `Simulated ${total} case(s): ${changed} decision(s) would change. Nothing was saved.${auditNote}`,
      );
    } catch (error) {
      setSimulation(null);
      setSimStatus(error instanceof Error ? error.message : "Unexpected simulation error.");
    } finally {
      setSimulating(false);
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
          <div className="rounded-xl bg-[hsl(var(--muted)/0.35)] p-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Current version</p>
            <p className="text-lg font-semibold">{version ?? "-"}</p>
          </div>
          <div className="rounded-xl bg-[hsl(var(--muted)/0.35)] p-3">
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
          <div className="rounded-xl bg-[hsl(var(--muted)/0.35)] p-3">
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
          <div className="rounded-xl bg-[hsl(var(--muted)/0.35)] p-3">
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
          <div className="rounded-xl bg-[hsl(var(--muted)/0.35)] p-3">
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
              className="min-h-32 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.4)]"
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
              className="min-h-32 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.4)]"
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
              className="min-h-32 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.4)]"
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
              className="min-h-32 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.4)]"
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
          <CardDescription>
            Select two versions to compare, or rollback to a prior version.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? <p className="text-sm text-[hsl(var(--muted-foreground))]">No history records.</p> : null}
          {history.map((entry) => {
            const isA = diffA === entry.version;
            const isB = diffB === entry.version;
            return (
              <div key={entry.version} className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] p-2 text-sm">
                <div>
                  <p className="font-medium flex items-center gap-2">
                    <span>v{entry.version}</span>
                    {version === entry.version && (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-semibold text-emerald-400">
                        Active
                      </span>
                    )}
                  </p>
                  <p className="text-[hsl(var(--muted-foreground))]">
                    {entry.updatedAt}
                    {entry.updatedBy ? ` • ${entry.updatedBy}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={isA ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDiffA(isA ? null : entry.version)}
                    aria-label={isA ? `Deselect version ${entry.version} as diff baseline (A)` : `Select version ${entry.version} as diff baseline (A)`}
                    aria-pressed={isA}
                  >
                    A
                  </Button>
                  <Button
                    variant={isB ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDiffB(isB ? null : entry.version)}
                    aria-label={isB ? `Deselect version ${entry.version} as diff comparison (B)` : `Select version ${entry.version} as diff comparison (B)`}
                    aria-pressed={isB}
                  >
                    B
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={writeDisabled || version === entry.version}
                    onClick={() => rollback(entry.version)}
                    title={
                      writeDisabled
                        ? "Viewer mode is read-only"
                        : version === entry.version
                          ? "Cannot rollback to the current active version"
                          : "Rollback to this version"
                    }
                  >
                    Rollback
                  </Button>
                </div>
              </div>
            );
          })}

          {history.length > 0 && !history.some((entry) => entry.version !== version) ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
              Rollback is unavailable because no prior policy versions exist.
            </p>
          ) : null}


          {diffA !== null && diffB !== null && diffA !== diffB ? (
            <PolicyDiff
              entryA={history.find((e) => e.version === diffA)!}
              entryB={history.find((e) => e.version === diffB)!}
            />
          ) : diffA !== null && diffB !== null && diffA === diffB ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))] pt-2">Select two different versions to compare.</p>
          ) : diffA !== null || diffB !== null ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))] pt-2">
              Select one more version ({diffA !== null ? "B" : "A"}) to compare.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Simulate before saving</CardTitle>
          <CardDescription>
            Dry-run the unsaved draft against demo scenarios (and optionally your recent audit actions) to compare
            current vs proposed decisions. This is a pre-save safety check — it never saves the policy or consumes usage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runSimulation} disabled={writeDisabled || simulating}>
              {simulating ? "Simulating..." : "Run simulation"}
            </Button>
            <label className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
              <input
                type="checkbox"
                checked={includeAudit}
                disabled={writeDisabled || simulating}
                onChange={(event) => setIncludeAudit(event.target.checked)}
              />
              Include recent audit sample
            </label>
          </div>

          {simStatus ? (
            <Alert className="border-[hsl(var(--accent)/0.2)] bg-[hsl(var(--accent)/0.05)]">
              <AlertTitle>Simulation status</AlertTitle>
              <AlertDescription>{simStatus}</AlertDescription>
            </Alert>
          ) : null}

          {simulating ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Evaluating draft policy...</p>
          ) : simulation ? (
            <SimulationPanel report={simulation} />
          ) : null}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={savePolicy} disabled={writeDisabled}>Save Policy</Button>
        <Button variant="outline" onClick={loadPolicy} disabled={loading}>Reload</Button>
        <Button variant="outline" onClick={loadHistory} disabled={loading}>Reload History</Button>
      </div>

      {conflict ? (
        <Alert className="border-red-500/40 bg-red-500/10">
          <AlertTitle>Save conflict — another operator edited this policy</AlertTitle>
          <AlertDescription>
            <p>{conflict.message}</p>
            <p className="mt-1 text-sm">
              Your save was based on{" "}
              <span className="font-semibold">v{conflict.expectedVersion}</span>; the server is now at{" "}
              <span className="font-semibold">v{conflict.currentVersion}</span>
              {conflict.currentUpdatedAt
                ? ` (updated ${conflict.currentUpdatedAt})`
                : ""}
              . Your changes were not discarded automatically.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={discardLocalChangesAndReload}
                disabled={loading}
              >
                Reload latest &amp; discard my changes
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConflict(null)}
                disabled={loading}
              >
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <Alert className="border-[hsl(var(--accent)/0.2)] bg-[hsl(var(--accent)/0.05)]">
        <AlertTitle>Policy status</AlertTitle>
        <AlertDescription>
          {status}
          {updatedAt ? ` Last updated: ${updatedAt}` : ""}
        </AlertDescription>
      </Alert>
    </div>
  );
}

// ── PolicyDiff ────────────────────────────────────────────────────────────────

type DiffStatus = "added" | "removed" | "unchanged";

export function diffLists(a: string[], b: string[]): Array<{ value: string; status: DiffStatus }> {
  const setA = new Set(a);
  const setB = new Set(b);
  const all = Array.from(new Set([...a, ...b]));
  return all.map((value) => {
    if (setA.has(value) && !setB.has(value)) return { value, status: "removed" };
    if (!setA.has(value) && setB.has(value)) return { value, status: "added" };
    return { value, status: "unchanged" };
  });
}

const STATUS_STYLE: Record<DiffStatus, string> = {
  added: "bg-emerald-500/15 text-emerald-400",
  removed: "bg-red-500/15 text-red-400 line-through",
  unchanged: "text-[hsl(var(--muted-foreground))]",
};

const STATUS_PREFIX: Record<DiffStatus, string> = { added: "+ ", removed: "− ", unchanged: "  " };

function NumericDiffRow({ label, a, b }: { label: string; a: number | undefined; b: number | undefined }) {
  const changed = a !== b;
  return (
    <div className={`flex items-center justify-between rounded px-2 py-1 text-sm ${changed ? "bg-amber-500/15" : ""}`}>
      <span className="text-[hsl(var(--muted-foreground))]">{label}</span>
      <span>
        {changed ? (
          <>
            <span className="text-red-400 line-through mr-2">{a ?? "—"}</span>
            <span className="text-emerald-400">{b ?? "—"}</span>
          </>
        ) : (
          <span className="text-[hsl(var(--muted-foreground))]">{a ?? "—"}</span>
        )}
      </span>
    </div>
  );
}

function ListDiffSection({ label, a, b }: { label: string; a: string[]; b: string[] }) {
  const items = diffLists(a, b);
  const hasChanges = items.some((i) => i.status !== "unchanged");
  return (
    <div>
      <p className={`text-xs font-semibold mb-1 ${hasChanges ? "text-amber-400" : "text-[hsl(var(--muted-foreground))]"}`}>
        {label}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))] italic">empty</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.value} className={`rounded px-2 py-0.5 text-xs font-mono ${STATUS_STYLE[item.status]}`}>
              {STATUS_PREFIX[item.status]}{item.value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── SimulationPanel ─────────────────────────────────────────────────────────

const DECISION_STYLE: Record<DecisionType, string> = {
  APPROVE: "bg-emerald-500/15 text-emerald-400",
  WARN: "bg-amber-500/15 text-amber-400",
  REQUIRE_APPROVAL: "bg-sky-500/15 text-sky-400",
  BLOCK: "bg-red-500/15 text-red-400",
};

const SOURCE_LABEL: Record<SimulationSource, string> = {
  scenario: "Demo scenario",
  audit: "Recent audit",
};

function DecisionTag({ decision }: { decision: DecisionType }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-mono ${DECISION_STYLE[decision]}`}>{decision}</span>
  );
}

function SimulationPanel({ report }: { report: SimulationReport }) {
  if (report.cases.length === 0) {
    return (
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        No cases were available to simulate.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-lg bg-[hsl(var(--muted)/0.35)] px-3 py-1">
          Cases: <span className="font-semibold">{report.summary.total}</span>
        </span>
        <span className="rounded-lg bg-amber-500/15 px-3 py-1 text-amber-400">
          Changed: <span className="font-semibold">{report.summary.changed}</span>
        </span>
      </div>

      <ul className="space-y-2">
        {report.cases.map((entry) => (
          <li
            key={entry.id}
            className={`rounded-lg border p-3 text-sm ${
              entry.changed ? "border-amber-500/40 bg-amber-500/5" : "border-[hsl(var(--border))]"
            }`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="font-medium">{entry.label}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{SOURCE_LABEL[entry.source]}</p>
              </div>
              <div className="flex items-center gap-2">
                <DecisionTag decision={entry.current.decision} />
                <span className="text-[hsl(var(--muted-foreground))]">→</span>
                <DecisionTag decision={entry.proposed.decision} />
                {entry.changed ? (
                  <span className="text-xs font-semibold text-amber-400">changed</span>
                ) : (
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">same</span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PolicyDiff({ entryA, entryB }: { entryA: PolicyHistoryEntry; entryB: PolicyHistoryEntry }) {
  const a = entryA.policy;
  const b = entryB.policy;

  if (!a || !b) {
    return (
      <Alert className="mt-3 border-amber-500/40 bg-amber-500/10">
        <AlertTitle>Diff unavailable</AlertTitle>
        <AlertDescription>Policy data not available for one or both selected versions.</AlertDescription>
      </Alert>
    );
  }

  const hoursChanged = a.allowedHours?.start !== b.allowedHours?.start || a.allowedHours?.end !== b.allowedHours?.end;

  return (
    <div className="mt-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold">
          Diff: <span className="text-red-400">v{entryA.version}</span>
          {" → "}
          <span className="text-emerald-400">v{entryB.version}</span>
        </p>
        <div className="flex gap-3 text-xs text-[hsl(var(--muted-foreground))]">
          <span className="text-red-400">− removed</span>
          <span className="text-emerald-400">+ added</span>
          <span className="text-amber-400">~ changed</span>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))] mb-1">Caps &amp; Thresholds</p>
        <NumericDiffRow label="Per-tx cap (XLM)" a={a.perTxCapXLM} b={b.perTxCapXLM} />
        <NumericDiffRow label="Daily cap (XLM)" a={a.dailyCapXLM} b={b.dailyCapXLM} />
        <NumericDiffRow label="Max tool calls/day" a={a.maxToolCallsPerDay} b={b.maxToolCallsPerDay} />
        <NumericDiffRow label="Risk threshold" a={a.riskThreshold} b={b.riskThreshold} />
        {(a.allowedHours ?? b.allowedHours) ? (
          <div className={`flex items-center justify-between rounded px-2 py-1 text-sm ${hoursChanged ? "bg-amber-500/15" : ""}`}>
            <span className="text-[hsl(var(--muted-foreground))]">Allowed hours</span>
            <span>
              {hoursChanged ? (
                <>
                  <span className="text-red-400 line-through mr-2">
                    {a.allowedHours ? `${a.allowedHours.start}–${a.allowedHours.end}` : "—"}
                  </span>
                  <span className="text-emerald-400">
                    {b.allowedHours ? `${b.allowedHours.start}–${b.allowedHours.end}` : "—"}
                  </span>
                </>
              ) : (
                <span className="text-[hsl(var(--muted-foreground))]">
                  {a.allowedHours ? `${a.allowedHours.start}–${a.allowedHours.end}` : "—"}
                </span>
              )}
            </span>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ListDiffSection label="Allowed domains" a={a.allowedDomains} b={b.allowedDomains} />
        <ListDiffSection label="Blocked domains" a={a.blockedDomains} b={b.blockedDomains} />
        <ListDiffSection label="Allowed tools" a={a.allowedTools} b={b.allowedTools} />
        <ListDiffSection label="Blocked tools" a={a.blockedTools} b={b.blockedTools} />
      </div>
    </div>
  );
}
