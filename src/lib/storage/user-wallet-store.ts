import { promises as fs } from "node:fs";

import { runWithDatabase } from "@/lib/storage/db";
import { getFortexaStoreDir, getFortexaStorePath } from "@/lib/storage/paths";

export type UserWallet = {
  userId: string;
  publicKey: string;
  source: "external";
  provider?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

type WalletStoreFile = {
  wallets: Record<string, UserWallet | { [key: string]: unknown }>;
};

const storePath = getFortexaStorePath("wallets.json");

async function ensureStore() {
  await fs.mkdir(getFortexaStoreDir(), { recursive: true });
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

export async function getUserWallet(userId: string): Promise<UserWallet | { expired: true } | null> {
  const db = await runWithDatabase("getUserWallet", async (pool) => {
    const result = await pool.query<{
      user_id: string;
      public_key: string;
      source: string;
      provider: string | null;
      created_at: string;
      updated_at: string;
      expires_at: string | null;
    }>(
      `
        SELECT user_id, public_key, source, provider, created_at, updated_at, expires_at
        FROM fortexa_wallets
        WHERE user_id = $1
      `,
      [userId]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return { expired: true as const };
    }

    return {
      userId: row.user_id,
      publicKey: row.public_key,
      source: "external" as const,
      provider: row.provider ?? undefined,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : undefined,
    };
  });

  if (db.available) {
    return db.value;
  }

  const store = await readStore();
  const wallet = store.wallets[userId];
  if (!wallet || typeof wallet !== "object" || !("source" in wallet) || !("publicKey" in wallet)) {
    return null;
  }
  
  const userWallet = wallet as UserWallet;
  if (userWallet.expiresAt && new Date(userWallet.expiresAt).getTime() < Date.now()) {
    return { expired: true as const };
  }
  
  return userWallet;
}

export async function upsertUserWallet(
  userId: string,
  payload: {
    publicKey: string;
    source: "external";
    provider?: string;
    expiresAt?: string;
  }
) {
  const db = await runWithDatabase("upsertUserWallet", async (pool) => {
    const existing = await pool.query<{ created_at: string }>(
      `
        SELECT created_at
        FROM fortexa_wallets
        WHERE user_id = $1
      `,
      [userId]
    );

    const nowIso = new Date().toISOString();
    const createdAt = existing.rows[0]?.created_at
      ? new Date(existing.rows[0].created_at).toISOString()
      : nowIso;
      
    // Default expiration to 24 hours from now if not provided
    const expiresAt = payload.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await pool.query(
      `
        INSERT INTO fortexa_wallets (user_id, public_key, source, provider, created_at, updated_at, expires_at)
        VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::timestamptz)
        ON CONFLICT (user_id)
        DO UPDATE SET
          public_key = EXCLUDED.public_key,
          source = EXCLUDED.source,
          provider = EXCLUDED.provider,
          updated_at = EXCLUDED.updated_at,
          expires_at = EXCLUDED.expires_at
      `,
      [userId, payload.publicKey, payload.source, payload.provider ?? null, createdAt, nowIso, expiresAt]
    );

    return {
      userId,
      publicKey: payload.publicKey,
      source: payload.source,
      provider: payload.provider,
      createdAt,
      updatedAt: nowIso,
      expiresAt,
    };
  });

  if (db.available) {
    return db.value;
  }

  const store = await readStore();
  const now = new Date().toISOString();
  const existing = await getUserWallet(userId);
  const createdAt = (existing && !("expired" in existing)) ? existing.createdAt : now;
  const expiresAt = payload.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const next: UserWallet = {
    userId,
    publicKey: payload.publicKey,
    source: payload.source,
    provider: payload.provider,
    createdAt: createdAt,
    updatedAt: now,
    expiresAt,
  };

  store.wallets[userId] = next;
  await writeStore(store);
  return next;
}

export async function revokeUserWallet(userId: string): Promise<void> {
  const db = await runWithDatabase("revokeUserWallet", async (pool) => {
    await pool.query(
      `
        DELETE FROM fortexa_wallets
        WHERE user_id = $1
      `,
      [userId]
    );
    return true;
  });

  if (db.available) {
    return;
  }

  const store = await readStore();
  if (store.wallets[userId]) {
    delete store.wallets[userId];
    await writeStore(store);
  }
}
