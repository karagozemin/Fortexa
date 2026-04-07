import { promises as fs } from "node:fs";
import path from "node:path";

import { decryptLocalSecret, encryptLocalSecret } from "@/lib/security/local-crypto";

export type UserWallet = {
  userId: string;
  publicKey: string;
  secret?: string;
  encryptedSecret?: string;
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
  const store = JSON.parse(raw) as WalletStoreFile;

  let migrated = false;
  for (const [userId, wallet] of Object.entries(store.wallets)) {
    if (wallet.secret && !wallet.encryptedSecret) {
      store.wallets[userId] = {
        ...wallet,
        encryptedSecret: encryptLocalSecret(wallet.secret),
        secret: undefined,
        updatedAt: new Date().toISOString(),
      };
      migrated = true;
    }
  }

  if (migrated) {
    await writeStore(store);
  }

  return store;
}

async function writeStore(store: WalletStoreFile) {
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

export async function getUserWallet(userId: string) {
  const store = await readStore();
  const wallet = store.wallets[userId] ?? null;

  if (!wallet) {
    return null;
  }

  if (wallet.encryptedSecret) {
    return {
      ...wallet,
      secret: decryptLocalSecret(wallet.encryptedSecret),
    };
  }

  return wallet;
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
    secret: undefined,
    encryptedSecret: payload.secret ? encryptLocalSecret(payload.secret) : existing?.encryptedSecret,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  store.wallets[userId] = next;
  await writeStore(store);
  return next;
}
