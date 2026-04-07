import { Pool } from "pg";

import { logWarn } from "@/lib/observability/logger";
import { STORAGE_MIGRATIONS } from "@/lib/storage/migrations";

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
        CREATE TABLE IF NOT EXISTS fortexa_schema_migrations (
          id TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      const applied = await targetPool.query<{ id: string }>(
        `
          SELECT id
          FROM fortexa_schema_migrations
        `
      );

      const appliedSet = new Set(applied.rows.map((row) => row.id));

      for (const migration of STORAGE_MIGRATIONS) {
        if (appliedSet.has(migration.id)) {
          continue;
        }

        await targetPool.query("BEGIN");
        try {
          await targetPool.query(migration.sql);
          await targetPool.query(
            `
              INSERT INTO fortexa_schema_migrations (id)
              VALUES ($1)
            `,
            [migration.id]
          );
          await targetPool.query("COMMIT");
        } catch (error) {
          await targetPool.query("ROLLBACK");
          throw error;
        }
      }
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

export async function __resetDatabaseForTests() {
  initPromise = null;
  if (pool) {
    await pool.end().catch(() => undefined);
  }
  pool = null;
}
