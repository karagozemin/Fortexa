import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { getUserWallet, upsertUserWallet, revokeUserWallet } from "./user-wallet-store";
import { getFortexaStoreDir } from "./paths";

// Ensure tests use the fallback JSON store by bypassing Postgres if we don't configure it.
// The existing app logic falls back to JSON if db is unavailable.

describe("user-wallet-store (fallback)", () => {
  const storePath = path.join(getFortexaStoreDir(), "wallets.json");

  beforeEach(async () => {
    // ensure empty store before each test
    await fs.mkdir(getFortexaStoreDir(), { recursive: true }).catch(() => {});
    await fs.writeFile(storePath, JSON.stringify({ wallets: {} }), "utf8").catch(() => {});
  });

  afterEach(async () => {
    await fs.unlink(storePath).catch(() => {});
  });

  it("returns null for missing mapping", async () => {
    const wallet = await getUserWallet("missing-user");
    expect(wallet).toBeNull();
  });

  it("upserts and returns a valid session mapping", async () => {
    const wallet = await upsertUserWallet("user-1", {
      publicKey: "GDEV123",
      source: "external",
      provider: "test",
    });

    expect(wallet.userId).toBe("user-1");
    expect(wallet.publicKey).toBe("GDEV123");
    expect(wallet.expiresAt).toBeDefined();

    const fetched = await getUserWallet("user-1");
    expect(fetched).not.toBeNull();
    if (fetched && !("expired" in fetched)) {
      expect(fetched.publicKey).toBe("GDEV123");
    } else {
      expect.fail("Expected a valid UserWallet");
    }
  });

  it("identifies expired session mappings", async () => {
    // Insert with expiration in the past
    await upsertUserWallet("user-2", {
      publicKey: "GDEV456",
      source: "external",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const fetched = await getUserWallet("user-2");
    expect(fetched).toEqual({ expired: true });
  });

  it("revokes session mappings deterministically", async () => {
    await upsertUserWallet("user-3", {
      publicKey: "GDEV789",
      source: "external",
    });

    let fetched = await getUserWallet("user-3");
    expect(fetched).not.toBeNull();
    expect(fetched).not.toEqual({ expired: true });

    await revokeUserWallet("user-3");

    fetched = await getUserWallet("user-3");
    expect(fetched).toBeNull();
  });
});
