import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";

import { runWithDatabase } from "@/lib/storage/db";
import { getFortexaStoreDir, getFortexaStorePath } from "@/lib/storage/paths";

export type SubmitIdempotencyRecord = {
  userId: string;
  idempotencyKey: string;
  xdrHash: string;
  result: unknown;
  createdAt: string;
};

type IdempotencyStoreFile = {
  records: Record<string, SubmitIdempotencyRecord>;
};

const DEFAULT_RETENTION_DAYS = 7;
const storePath = getFortexaStorePath("submit-idempotency.json");

export function hashSignedXdr(signedXdr: string) {
  return createHash("sha256").update(signedXdr).digest("hex");
}

export function getIdempotencyRetentionDays(): number {
  const raw = process.env.FORTEXA_IDEMPOTENCY_RETENTION_DAYS?.trim();
  if (!raw) return DEFAULT_RETENTION_DAYS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_RETENTION_DAYS;
  return parsed;
}

function fileKey(userId: string, idempotencyKey: string) {
  return `${userId}:${idempotencyKey}`;
}

async function ensureStore() {
  await fs.mkdir(getFortexaStoreDir(), { recursive: true });
  try {
    await fs.access(storePath);
  } catch {
    const initial: IdempotencyStoreFile = { records: {} };
    await fs.writeFile(storePath, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readStore(): Promise<IdempotencyStoreFile> {
  await ensureStore();
  const raw = await fs.readFile(storePath, "utf8");
  return JSON.parse(raw) as IdempotencyStoreFile;
}

async function writeStore(store: IdempotencyStoreFile) {
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

export async function getIdempotencyRecord(
  userId: string,
  idempotencyKey: string
): Promise<SubmitIdempotencyRecord | null> {
  const db = await runWithDatabase("getIdempotencyRecord", async (pool) => {
    const result = await pool.query<{
      user_id: string;
      idempotency_key: string;
      xdr_hash: string;
      result: unknown;
      created_at: string;
    }>(
      `
        SELECT user_id, idempotency_key, xdr_hash, result, created_at
        FROM fortexa_submit_idempotency
        WHERE user_id = $1 AND idempotency_key = $2
      `,
      [userId, idempotencyKey]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      userId: row.user_id,
      idempotencyKey: row.idempotency_key,
      xdrHash: row.xdr_hash,
      result: row.result,
      createdAt: new Date(row.created_at).toISOString(),
    } satisfies SubmitIdempotencyRecord;
  });

  if (db.available) {
    return db.value;
  }

  const store = await readStore();
  return store.records[fileKey(userId, idempotencyKey)] ?? null;
}

export async function putIdempotencyRecord(
  userId: string,
  idempotencyKey: string,
  payload: { xdrHash: string; result: unknown }
): Promise<SubmitIdempotencyRecord> {
  const record: SubmitIdempotencyRecord = {
    userId,
    idempotencyKey,
    xdrHash: payload.xdrHash,
    result: payload.result,
    createdAt: new Date().toISOString(),
  };

  const db = await runWithDatabase("putIdempotencyRecord", async (pool) => {
    // First write wins: a concurrent retry must not overwrite the original result.
    await pool.query(
      `
        INSERT INTO fortexa_submit_idempotency (user_id, idempotency_key, xdr_hash, result, created_at)
        VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)
        ON CONFLICT (user_id, idempotency_key) DO NOTHING
      `,
      [userId, idempotencyKey, payload.xdrHash, JSON.stringify(payload.result), record.createdAt]
    );
    return record;
  });

  if (db.available) {
    return db.value;
  }

  const store = await readStore();
  const key = fileKey(userId, idempotencyKey);
  if (!store.records[key]) {
    store.records[key] = record;
    await writeStore(store);
    return record;
  }
  return store.records[key];
}

export async function resetSubmitIdempotencyState(userId: string) {
  const db = await runWithDatabase("resetSubmitIdempotencyState", async (pool) => {
    await pool.query(`DELETE FROM fortexa_submit_idempotency WHERE user_id = $1`, [userId]);
    return true;
  });

  if (db.available) {
    return;
  }

  const store = await readStore();
  let mutated = false;
  for (const key of Object.keys(store.records)) {
    if (store.records[key].userId === userId) {
      delete store.records[key];
      mutated = true;
    }
  }

  if (mutated) {
    await writeStore(store);
  }
}

export async function cleanupOldIdempotencyRecords(
  retentionDays?: number
): Promise<number> {
  const days = retentionDays ?? getIdempotencyRetentionDays();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const db = await runWithDatabase("cleanupOldIdempotencyRecords", async (pool) => {
    const result = await pool.query(
      `DELETE FROM fortexa_submit_idempotency
       WHERE created_at < $1::timestamptz
         AND created_at::date != CURRENT_DATE`,
      [cutoff.toISOString()]
    );
    return result.rowCount ?? 0;
  });

  if (db.available) {
    return db.value;
  }

  const store = await readStore();
  const today = new Date().toISOString().slice(0, 10);
  let deletedCount = 0;
  let mutated = false;

  for (const [key, record] of Object.entries(store.records)) {
    const recordDate = new Date(record.createdAt);
    if (recordDate < cutoff && record.createdAt.slice(0, 10) !== today) {
      delete store.records[key];
      deletedCount++;
      mutated = true;
    }
  }

  if (mutated) {
    await writeStore(store);
  }

  return deletedCount;
}

let lastCleanupTime = 0;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export function getLastCleanupTime(): number {
  return lastCleanupTime;
}

/** Reset the last cleanup time (used in tests). */
export function __resetLastCleanupTime() {
  lastCleanupTime = 0;
}

export function maybeRunCleanup(): void {
  const now = Date.now();
  if (now - lastCleanupTime < CLEANUP_INTERVAL_MS) return;
  lastCleanupTime = now;

  cleanupOldIdempotencyRecords().catch(() => {
    // Cleanup is best-effort; failures should not affect the request.
  });
}