import { promises as fs } from "node:fs";

import { runWithDatabase } from "@/lib/storage/db";
import { getFortexaStoreDir, getFortexaStorePath } from "@/lib/storage/paths";
import type { AuditEntry, DailyUsage, DecisionType } from "@/lib/types/domain";

type AuditStoreFile = {
  auditByUser: Record<string, AuditEntry[]>;
  usageByUser: Record<string, DailyUsage>;
};

export type AuditFilter = {
  from?: string;
  to?: string;
  decision?: string;
  domain?: string;
  actionId?: string;
};

const VALID_DECISIONS: DecisionType[] = ["APPROVE", "WARN", "REQUIRE_APPROVAL", "BLOCK"];
const VALID_DECISION_SET = new Set<string>(VALID_DECISIONS);

export function validateAuditFilter(filter: AuditFilter): string | null {
  if (filter.from !== undefined && isNaN(Date.parse(filter.from))) {
    return "Invalid 'from' date. Use ISO 8601 format (e.g. 2025-01-01T00:00:00Z).";
  }
  if (filter.to !== undefined && isNaN(Date.parse(filter.to))) {
    return "Invalid 'to' date. Use ISO 8601 format (e.g. 2025-01-01T00:00:00Z).";
  }
  if (filter.decision !== undefined && !VALID_DECISION_SET.has(filter.decision)) {
    return `Invalid decision '${filter.decision}'. Must be one of: ${VALID_DECISIONS.join(", ")}.`;
  }
  return null;
}

function applyFilter(entries: AuditEntry[], filter?: AuditFilter): AuditEntry[] {
  if (!filter) return entries;

  const { from, to, decision, domain, actionId } = filter;

  return entries.filter((entry) => {
    if (from !== undefined && entry.timestamp < from) return false;
    if (to !== undefined && entry.timestamp > to) return false;
    if (decision !== undefined && entry.decision !== decision) return false;
    if (domain !== undefined && !entry.action.domain.toLowerCase().includes(domain.toLowerCase())) return false;
    if (actionId !== undefined && !entry.action.id.toLowerCase().includes(actionId.toLowerCase())) return false;
    return true;
  });
}

const storePath = getFortexaStorePath("audit.json");

const baselineUsage: DailyUsage = {
  spentXLM: 0,
  toolCalls: 0,
  lastUpdated: new Date().toISOString(),
};

async function ensureStore() {
  await fs.mkdir(getFortexaStoreDir(), { recursive: true });
  try {
    await fs.access(storePath);
  } catch {
    const initial: AuditStoreFile = {
      auditByUser: {},
      usageByUser: {},
    };
    await fs.writeFile(storePath, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readStore(): Promise<AuditStoreFile> {
  await ensureStore();
  const raw = await fs.readFile(storePath, "utf8");
  return JSON.parse(raw) as AuditStoreFile;
}

async function writeStore(store: AuditStoreFile) {
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

export async function listAuditEntries(userId: string, filter?: AuditFilter) {
  const db = await runWithDatabase("listAuditEntries", async (pool) => {
    const result = await pool.query<{ payload: AuditEntry }>(
      `
        SELECT payload
        FROM fortexa_audit_entries
        WHERE user_id = $1
        ORDER BY timestamp DESC
      `,
      [userId]
    );

    return applyFilter(result.rows.map((row) => row.payload), filter);
  });

  if (db.available) {
    return db.value;
  }

  const store = await readStore();
  const entries = store.auditByUser[userId] ?? [];
  return applyFilter(
    [...entries].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
    filter
  );
}

export async function listAllAuditEntriesByUser(filter?: AuditFilter) {
  const db = await runWithDatabase("listAllAuditEntriesByUser", async (pool) => {
    const result = await pool.query<{ user_id: string; payload: AuditEntry }>(
      `
        SELECT user_id, payload
        FROM fortexa_audit_entries
        ORDER BY timestamp DESC
      `
    );

    const grouped: Record<string, AuditEntry[]> = {};

    for (const row of result.rows) {
      grouped[row.user_id] ??= [];
      grouped[row.user_id].push(row.payload);
    }

    for (const userId of Object.keys(grouped)) {
      grouped[userId] = applyFilter(grouped[userId], filter);
    }

    return grouped;
  });

  if (db.available) {
    return db.value;
  }

  const store = await readStore();
  const result: Record<string, AuditEntry[]> = {};

  for (const [userId, entries] of Object.entries(store.auditByUser)) {
    const filtered = applyFilter(
      [...entries].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
      filter
    );
    if (filtered.length > 0) {
      result[userId] = filtered;
    }
  }

  return result;
}

export async function appendAuditEntry(userId: string, entry: AuditEntry) {
  const db = await runWithDatabase("appendAuditEntry", async (pool) => {
    await pool.query(
      `
        INSERT INTO fortexa_audit_entries (id, user_id, timestamp, payload)
        VALUES ($1, $2, $3::timestamptz, $4::jsonb)
      `,
      [entry.id, userId, entry.timestamp, JSON.stringify(entry)]
    );
  });

  if (db.available) {
    return;
  }

  const store = await readStore();
  const entries = store.auditByUser[userId] ?? [];
  entries.push(entry);
  store.auditByUser[userId] = entries;
  await writeStore(store);
}

export async function getDailyUsage(userId: string) {
  const db = await runWithDatabase("getDailyUsage", async (pool) => {
    const result = await pool.query<{
      spent_xlm: number;
      tool_calls: number;
      last_updated: string;
    }>(
      `
        SELECT spent_xlm, tool_calls, last_updated
        FROM fortexa_usage
        WHERE user_id = $1
      `,
      [userId]
    );

    const row = result.rows[0];
    if (!row) {
      return {
        ...baselineUsage,
        lastUpdated: new Date().toISOString(),
      };
    }

    return {
      spentXLM: row.spent_xlm,
      toolCalls: row.tool_calls,
      lastUpdated: new Date(row.last_updated).toISOString(),
    };
  });

  if (db.available) {
    return db.value;
  }

  const store = await readStore();
  return (
    store.usageByUser[userId] ?? {
      ...baselineUsage,
      lastUpdated: new Date().toISOString(),
    }
  );
}

export async function consumeUsage(userId: string, amountXLM: number) {
  const db = await runWithDatabase("consumeUsage", async (pool) => {
    const current = await pool.query<{
      spent_xlm: number;
      tool_calls: number;
    }>(
      `
        SELECT spent_xlm, tool_calls
        FROM fortexa_usage
        WHERE user_id = $1
      `,
      [userId]
    );

    const spentXLM = (current.rows[0]?.spent_xlm ?? 0) + amountXLM;
    const toolCalls = (current.rows[0]?.tool_calls ?? 0) + 1;
    const updatedAt = new Date().toISOString();

    await pool.query(
      `
        INSERT INTO fortexa_usage (user_id, spent_xlm, tool_calls, last_updated)
        VALUES ($1, $2, $3, $4::timestamptz)
        ON CONFLICT (user_id)
        DO UPDATE SET
          spent_xlm = EXCLUDED.spent_xlm,
          tool_calls = EXCLUDED.tool_calls,
          last_updated = EXCLUDED.last_updated
      `,
      [userId, spentXLM, toolCalls, updatedAt]
    );
  });

  if (db.available) {
    return;
  }

  const store = await readStore();
  const current =
    store.usageByUser[userId] ?? {
      ...baselineUsage,
      lastUpdated: new Date().toISOString(),
    };

  store.usageByUser[userId] = {
    spentXLM: current.spentXLM + amountXLM,
    toolCalls: current.toolCalls + 1,
    lastUpdated: new Date().toISOString(),
  };

  await writeStore(store);
}

export async function resetAuditState(userId: string) {
  const db = await runWithDatabase("resetAuditState", async (pool) => {
    await pool.query("DELETE FROM fortexa_audit_entries WHERE user_id = $1", [userId]);
    await pool.query(
      `
        INSERT INTO fortexa_usage (user_id, spent_xlm, tool_calls, last_updated)
        VALUES ($1, 0, 0, $2::timestamptz)
        ON CONFLICT (user_id)
        DO UPDATE SET
          spent_xlm = EXCLUDED.spent_xlm,
          tool_calls = EXCLUDED.tool_calls,
          last_updated = EXCLUDED.last_updated
      `,
      [userId, new Date().toISOString()]
    );
  });

  if (db.available) {
    return;
  }

  const store = await readStore();
  store.auditByUser[userId] = [];
  store.usageByUser[userId] = {
    ...baselineUsage,
    lastUpdated: new Date().toISOString(),
  };
  await writeStore(store);
}
