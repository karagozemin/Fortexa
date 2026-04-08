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

export async function getUserWallet(userId: string) {
  const db = await runWithDatabase("getUserWallet", async (pool) => {
    const result = await pool.query<{
      user_id: string;
      public_key: string;
      source: string;
      provider: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `
        SELECT user_id, public_key, source, provider, created_at, updated_at
        FROM fortexa_wallets
        WHERE user_id = $1
      `,
      [userId]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      userId: row.user_id,
      publicKey: row.public_key,
      source: "external" as const,
      provider: row.provider ?? undefined,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
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

    await pool.query(
      `
        INSERT INTO fortexa_wallets (user_id, public_key, source, provider, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)
        ON CONFLICT (user_id)
        DO UPDATE SET
          public_key = EXCLUDED.public_key,
          source = EXCLUDED.source,
          provider = EXCLUDED.provider,
          updated_at = EXCLUDED.updated_at
      `,
      [userId, payload.publicKey, payload.source, payload.provider ?? null, createdAt, nowIso]
    );

    return {
      userId,
      publicKey: payload.publicKey,
      source: payload.source,
      provider: payload.provider,
      createdAt,
      updatedAt: nowIso,
    };
  });

  if (db.available) {
    return db.value;
  }

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
