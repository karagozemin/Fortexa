import { promises as fs } from "node:fs";
import path from "node:path";

export type UserWallet = {
  userId: string;
  publicKey: string;
  secret?: string;
  source: "custodial" | "freighter";
  createdAt: string;
  updatedAt: string;
};

type WalletStoreFile = {
  wallets: Record<string, UserWallet>;
};

const storeDir = path.join(process.cwd(), ".fortexa");
const storePath = path.join(storeDir, "wallets.json");

async function ensureStore() {
  await fs.mkdir(storeDir, { recursive: true });
  try {
    await fs.access(storePath);
  } catch {
    const initial: WalletStoreFile = { wallets: {} };
    await fs.writeFile(storePath, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readStore(): Promise<WalletStoreFile> {
  await ensureStore();
  const raw = await fs.readFile(storePath, "utf8");
  return JSON.parse(raw) as WalletStoreFile;
}

async function writeStore(store: WalletStoreFile) {
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

export async function getUserWallet(userId: string) {
  const store = await readStore();
  return store.wallets[userId] ?? null;
}

export async function upsertUserWallet(
  userId: string,
  payload: {
    publicKey: string;
    secret?: string;
    source: "custodial" | "freighter";
  }
) {
  const store = await readStore();
  const now = new Date().toISOString();
  const existing = store.wallets[userId];

  const next: UserWallet = {
    userId,
    publicKey: payload.publicKey,
    source: payload.source,
    secret: payload.secret,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  store.wallets[userId] = next;
  await writeStore(store);
  return next;
}
