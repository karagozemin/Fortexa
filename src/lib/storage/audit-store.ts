import { promises as fs } from "node:fs";
import path from "node:path";

import { runWithDatabase } from "@/lib/storage/db";
import type { AuditEntry, DailyUsage } from "@/lib/types/domain";

type AuditStoreFile = {
  auditByUser: Record<string, AuditEntry[]>;
  usageByUser: Record<string, DailyUsage>;
};

const storeDir = path.join(process.cwd(), ".fortexa");
const storePath = path.join(storeDir, "audit.json");

const baselineUsage: DailyUsage = {
  spentXLM: 0,
  toolCalls: 0,
  lastUpdated: new Date().toISOString(),
};

async function ensureStore() {
  await fs.mkdir(storeDir, { recursive: true });
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

export async function listAuditEntries(userId: string) {
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

    return result.rows.map((row) => row.payload);
  });

  if (db.available) {
    return db.value;
  }

  const store = await readStore();
  const entries = store.auditByUser[userId] ?? [];
  return [...entries].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

export async function listAllAuditEntriesByUser() {
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

    return grouped;
  });

  if (db.available) {
    return db.value;
  }

  const store = await readStore();
  const result: Record<string, AuditEntry[]> = {};

  for (const [userId, entries] of Object.entries(store.auditByUser)) {
    result[userId] = [...entries].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
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
