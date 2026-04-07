import { Pool } from "pg";

import { logWarn } from "@/lib/observability/logger";

type DatabaseExecution<T> =
  | {
      available: true;
      value: T;
    }
  | {
      available: false;
    };

let pool: Pool | null = null;
let initPromise: Promise<void> | null = null;

function getDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  return value && value.length > 0 ? value : null;
}

function getPool() {
  const url = getDatabaseUrl();
  if (!url) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: url,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
  }

  return pool;
}

async function ensureSchema(targetPool: Pool) {
  if (!initPromise) {
    initPromise = (async () => {
      await targetPool.query(`
        CREATE TABLE IF NOT EXISTS fortexa_wallets (
          user_id TEXT PRIMARY KEY,
          public_key TEXT NOT NULL,
          source TEXT NOT NULL,
          provider TEXT,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );
      `);

      await targetPool.query(`
        CREATE TABLE IF NOT EXISTS fortexa_audit_entries (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL,
          payload JSONB NOT NULL
        );
      `);

      await targetPool.query(`
        CREATE INDEX IF NOT EXISTS fortexa_audit_entries_user_ts_idx
        ON fortexa_audit_entries (user_id, timestamp DESC);
      `);

      await targetPool.query(`
        CREATE TABLE IF NOT EXISTS fortexa_usage (
          user_id TEXT PRIMARY KEY,
          spent_xlm DOUBLE PRECISION NOT NULL,
          tool_calls INTEGER NOT NULL,
          last_updated TIMESTAMPTZ NOT NULL
        );
      `);

      await targetPool.query(`
        CREATE TABLE IF NOT EXISTS fortexa_policy_state (
          id SMALLINT PRIMARY KEY,
          version INTEGER NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          policy JSONB NOT NULL
        );
      `);

      await targetPool.query(`
        CREATE TABLE IF NOT EXISTS fortexa_policy_history (
          version INTEGER PRIMARY KEY,
          updated_at TIMESTAMPTZ NOT NULL,
          updated_by TEXT,
          policy JSONB NOT NULL
        );
      `);
    })();
  }

  await initPromise;
}

export async function runWithDatabase<T>(
  operationName: string,
  action: (targetPool: Pool) => Promise<T>
): Promise<DatabaseExecution<T>> {
  const targetPool = getPool();
  if (!targetPool) {
    return { available: false };
  }

  try {
    await ensureSchema(targetPool);
    const value = await action(targetPool);
    return { available: true, value };
  } catch (error) {
    logWarn("Database operation failed, falling back to file store", {
      operationName,
      detail: error instanceof Error ? error.message : "unknown",
    });

    return { available: false };
  }
}
