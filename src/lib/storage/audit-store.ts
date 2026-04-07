import { promises as fs } from "node:fs";
import path from "node:path";

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
  const store = await readStore();
  const entries = store.auditByUser[userId] ?? [];
  return [...entries].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

export async function listAllAuditEntriesByUser() {
  const store = await readStore();
  const result: Record<string, AuditEntry[]> = {};

  for (const [userId, entries] of Object.entries(store.auditByUser)) {
    result[userId] = [...entries].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  }

  return result;
}

export async function appendAuditEntry(userId: string, entry: AuditEntry) {
  const store = await readStore();
  const entries = store.auditByUser[userId] ?? [];
  entries.push(entry);
  store.auditByUser[userId] = entries;
  await writeStore(store);
}

export async function getDailyUsage(userId: string) {
  const store = await readStore();
  return (
    store.usageByUser[userId] ?? {
      ...baselineUsage,
      lastUpdated: new Date().toISOString(),
    }
  );
}

export async function consumeUsage(userId: string, amountXLM: number) {
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
  const store = await readStore();
  store.auditByUser[userId] = [];
  store.usageByUser[userId] = {
    ...baselineUsage,
    lastUpdated: new Date().toISOString(),
  };
  await writeStore(store);
}
