import { promises as fs } from "node:fs";
import path from "node:path";

export type UserWallet = {
  userId: string;
  publicKey: string;
  source: "external";
  provider?: string;
  createdAt: string;
  updatedAt: string;
};

type WalletStoreFile = {
  wallets: Record<string, UserWallet | { [key: string]: unknown }>;
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
  for (const [userId, parsedWallet] of Object.entries(store.wallets)) {
    const wallet = parsedWallet as {
      source?: string;
      publicKey?: string;
      createdAt?: string;
      provider?: string;
      secret?: unknown;
      encryptedSecret?: unknown;
    };

    if (wallet.source !== "freighter" && wallet.source !== "external") {
      delete store.wallets[userId];
      migrated = true;
      continue;
    }

    if ("secret" in wallet || "encryptedSecret" in wallet) {
      store.wallets[userId] = {
        userId,
        publicKey: wallet.publicKey ?? "",
        source: "external",
        provider: wallet.source === "freighter" ? "freighter" : wallet.provider,
        createdAt: wallet.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      migrated = true;
    }

    if (wallet.source === "freighter") {
      store.wallets[userId] = {
        userId,
        publicKey: wallet.publicKey ?? "",
        source: "external",
        provider: "freighter",
        createdAt: wallet.createdAt ?? new Date().toISOString(),
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
  const wallet = store.wallets[userId];
  if (!wallet || typeof wallet !== "object" || !("source" in wallet) || !("publicKey" in wallet)) {
    return null;
  }
  return wallet as UserWallet;
}

export async function upsertUserWallet(
  userId: string,
  payload: {
    publicKey: string;
    source: "external";
    provider?: string;
  }
) {
  const store = await readStore();
  const now = new Date().toISOString();
  const existing = await getUserWallet(userId);

  const next: UserWallet = {
    userId,
    publicKey: payload.publicKey,
    source: payload.source,
    provider: payload.provider,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  store.wallets[userId] = next;
  await writeStore(store);
  return next;
}
