import type { AuditEntry, DailyUsage } from "@/lib/types/domain";

const globalAuditKey = "__fortexa_audit_entries";
const globalUsageKey = "__fortexa_daily_usage";

type GlobalWithAudit = typeof globalThis & {
  [globalAuditKey]?: AuditEntry[];
  [globalUsageKey]?: DailyUsage;
};

const globalState = globalThis as GlobalWithAudit;

const baselineUsage: DailyUsage = {
  spentXLM: 42,
  toolCalls: 2,
  lastUpdated: new Date().toISOString(),
};

if (!globalState[globalAuditKey]) {
  globalState[globalAuditKey] = [];
}

if (!globalState[globalUsageKey]) {
  globalState[globalUsageKey] = baselineUsage;
}

export function listAuditEntries() {
  return [...(globalState[globalAuditKey] ?? [])].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

export function appendAuditEntry(entry: AuditEntry) {
  const entries = globalState[globalAuditKey] ?? [];
  entries.push(entry);
  globalState[globalAuditKey] = entries;
}

export function getDailyUsage() {
  return globalState[globalUsageKey]!;
}

export function consumeUsage(amountXLM: number) {
  const current = globalState[globalUsageKey]!;
  globalState[globalUsageKey] = {
    spentXLM: current.spentXLM + amountXLM,
    toolCalls: current.toolCalls + 1,
    lastUpdated: new Date().toISOString(),
  };
}

export function resetAuditState() {
  globalState[globalAuditKey] = [];
  globalState[globalUsageKey] = {
    ...baselineUsage,
    lastUpdated: new Date().toISOString(),
  };
}
