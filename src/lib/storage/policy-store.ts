import { promises as fs } from "node:fs";

import { defaultPolicyConfig } from "@/lib/policy/engine";
import { runWithDatabase } from "@/lib/storage/db";
import { getFortexaStoreDir, getFortexaStorePath } from "@/lib/storage/paths";
import type { PolicyConfig } from "@/lib/types/domain";

const storePath = getFortexaStorePath("policy.json");
const historyPath = getFortexaStorePath("policy-history.json");

type PolicyStoreFile = {
  policy: PolicyConfig;
  updatedAt: string;
  version: number;
};

type PolicyHistoryEntry = {
  version: number;
  updatedAt: string;
  updatedBy?: string;
  policy: PolicyConfig;
};

type PolicyHistoryFile = {
  entries: PolicyHistoryEntry[];
};

async function ensureStore() {
  await fs.mkdir(getFortexaStoreDir(), { recursive: true });
  try {
    await fs.access(storePath);
  } catch {
    const initial: PolicyStoreFile = {
      policy: defaultPolicyConfig,
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    await fs.writeFile(storePath, JSON.stringify(initial, null, 2), "utf8");
  }

  try {
    await fs.access(historyPath);
  } catch {
    const initialHistory: PolicyHistoryFile = {
      entries: [
        {
          version: 1,
          updatedAt: new Date().toISOString(),
          updatedBy: "system-bootstrap",
          policy: defaultPolicyConfig,
        },
      ],
    };

    await fs.writeFile(historyPath, JSON.stringify(initialHistory, null, 2), "utf8");
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(storePath, "utf8");

  try {
    return JSON.parse(raw) as Partial<PolicyStoreFile>;
  } catch {
    const reset: PolicyStoreFile = {
      policy: defaultPolicyConfig,
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    await fs.writeFile(storePath, JSON.stringify(reset, null, 2), "utf8");
    return reset;
  }
}

async function readHistoryStore() {
  await ensureStore();
  const raw = await fs.readFile(historyPath, "utf8");

  try {
    return JSON.parse(raw) as Partial<PolicyHistoryFile>;
  } catch {
    const reset: PolicyHistoryFile = {
      entries: [
        {
          version: 1,
          updatedAt: new Date().toISOString(),
          updatedBy: "system-reset",
          policy: defaultPolicyConfig,
        },
      ],
    };

    await fs.writeFile(historyPath, JSON.stringify(reset, null, 2), "utf8");
    return reset;
  }
}

function normalizePolicy(policy?: Partial<PolicyConfig>): PolicyConfig {
  return {
    allowedDomains: policy?.allowedDomains ?? defaultPolicyConfig.allowedDomains,
    blockedDomains: policy?.blockedDomains ?? defaultPolicyConfig.blockedDomains,
    allowedTools: policy?.allowedTools ?? defaultPolicyConfig.allowedTools,
    blockedTools: policy?.blockedTools ?? defaultPolicyConfig.blockedTools,
    perTxCapXLM: policy?.perTxCapXLM ?? defaultPolicyConfig.perTxCapXLM,
    dailyCapXLM: policy?.dailyCapXLM ?? defaultPolicyConfig.dailyCapXLM,
    maxToolCallsPerDay: policy?.maxToolCallsPerDay ?? defaultPolicyConfig.maxToolCallsPerDay,
    riskThreshold: policy?.riskThreshold ?? defaultPolicyConfig.riskThreshold,
    allowedHours: policy?.allowedHours ?? defaultPolicyConfig.allowedHours,
  };
}

async function writeStore(nextPolicy: PolicyConfig, nextVersion: number) {
  const next: PolicyStoreFile = {
    policy: nextPolicy,
    updatedAt: new Date().toISOString(),
    version: nextVersion,
  };

  const tempPath = `${storePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(tempPath, storePath);

  return next;
}

async function writeHistory(entries: PolicyHistoryEntry[]) {
  const next: PolicyHistoryFile = { entries };
  const tempPath = `${historyPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(tempPath, historyPath);
}

async function ensureDbPolicyState() {
  return runWithDatabase("ensureDbPolicyState", async (pool) => {
    const state = await pool.query<{
      version: number;
    }>(
      `
        SELECT version
        FROM fortexa_policy_state
        WHERE id = 1
      `
    );

    if (state.rows[0]) {
      return;
    }

    const now = new Date().toISOString();

    await pool.query(
      `
        INSERT INTO fortexa_policy_state (id, version, updated_at, policy)
        VALUES (1, 1, $1::timestamptz, $2::jsonb)
      `,
      [now, JSON.stringify(defaultPolicyConfig)]
    );

    await pool.query(
      `
        INSERT INTO fortexa_policy_history (version, updated_at, updated_by, policy)
        VALUES (1, $1::timestamptz, 'system-bootstrap', $2::jsonb)
        ON CONFLICT (version) DO NOTHING
      `,
      [now, JSON.stringify(defaultPolicyConfig)]
    );
  });
}

export async function getPolicyConfig() {
  const initialized = await ensureDbPolicyState();
  if (initialized.available) {
    const db = await runWithDatabase("getPolicyConfig", async (pool) => {
      const result = await pool.query<{
        policy: PolicyConfig;
        updated_at: string;
        version: number;
      }>(
        `
          SELECT policy, updated_at, version
          FROM fortexa_policy_state
          WHERE id = 1
        `
      );

      const row = result.rows[0];
      if (!row) {
        return {
          policy: normalizePolicy(defaultPolicyConfig),
          updatedAt: null,
          version: 1,
        };
      }

      return {
        policy: normalizePolicy(row.policy),
        updatedAt: new Date(row.updated_at).toISOString(),
        version: row.version ?? 1,
      };
    });

    if (db.available) {
      return db.value;
    }
  }

  const store = await readStore();
  return {
    policy: normalizePolicy(store.policy),
    updatedAt: store.updatedAt ?? null,
    version: store.version ?? 1,
  };
}

export async function updatePolicyConfig(nextPolicy: PolicyConfig, updatedBy?: string) {
  const initialized = await ensureDbPolicyState();
  if (initialized.available) {
    const db = await runWithDatabase("updatePolicyConfig", async (pool) => {
      const now = new Date().toISOString();
      const normalized = normalizePolicy(nextPolicy);

      const current = await pool.query<{ version: number }>(
        `
          SELECT version
          FROM fortexa_policy_state
          WHERE id = 1
        `
      );

      const nextVersion = (current.rows[0]?.version ?? 1) + 1;

      await pool.query(
        `
          INSERT INTO fortexa_policy_history (version, updated_at, updated_by, policy)
          VALUES ($1, $2::timestamptz, $3, $4::jsonb)
        `,
        [nextVersion, now, updatedBy ?? null, JSON.stringify(normalized)]
      );

      await pool.query(
        `
          UPDATE fortexa_policy_state
          SET version = $1,
              updated_at = $2::timestamptz,
              policy = $3::jsonb
          WHERE id = 1
        `,
        [nextVersion, now, JSON.stringify(normalized)]
      );

      return {
        policy: normalized,
        updatedAt: now,
        version: nextVersion,
      };
    });

    if (db.available) {
      return db.value;
    }
  }

  const current = await getPolicyConfig();
  const historyStore = await readHistoryStore();
  const nextVersion = (current.version ?? 1) + 1;
  const normalized = normalizePolicy(nextPolicy);

  const entry: PolicyHistoryEntry = {
    version: nextVersion,
    updatedAt: new Date().toISOString(),
    updatedBy,
    policy: normalized,
  };

  const nextEntries = [...(historyStore.entries ?? []), entry];
  await writeHistory(nextEntries);

  return writeStore(normalized, nextVersion);
}

export async function getPolicyHistory(limit = 20) {
  const initialized = await ensureDbPolicyState();
  if (initialized.available) {
    const db = await runWithDatabase("getPolicyHistory", async (pool) => {
      const maxLimit = Math.max(1, limit);
      const result = await pool.query<{
        version: number;
        updated_at: string;
        updated_by: string | null;
        policy: PolicyConfig;
      }>(
        `
          SELECT version, updated_at, updated_by, policy
          FROM fortexa_policy_history
          ORDER BY version DESC
          LIMIT $1
        `,
        [maxLimit]
      );

      return result.rows.map((row) => ({
        version: row.version,
        updatedAt: new Date(row.updated_at).toISOString(),
        updatedBy: row.updated_by ?? undefined,
        policy: normalizePolicy(row.policy),
      }));
    });

    if (db.available) {
      return db.value;
    }
  }

  const historyStore = await readHistoryStore();
  const entries = [...(historyStore.entries ?? [])].sort((left, right) => right.version - left.version);
  return entries.slice(0, Math.max(1, limit));
}

export async function rollbackPolicyVersion(targetVersion: number, updatedBy?: string) {
  const initialized = await ensureDbPolicyState();
  if (initialized.available) {
    const db = await runWithDatabase("rollbackPolicyVersion", async (pool) => {
      const result = await pool.query<{ policy: PolicyConfig }>(
        `
          SELECT policy
          FROM fortexa_policy_history
          WHERE version = $1
          LIMIT 1
        `,
        [targetVersion]
      );

      const matched = result.rows[0];
      if (!matched) {
        throw new Error(`Policy version ${targetVersion} not found.`);
      }

      const normalized = normalizePolicy(matched.policy);
      const now = new Date().toISOString();

      const current = await pool.query<{ version: number }>(
        `
          SELECT version
          FROM fortexa_policy_state
          WHERE id = 1
        `
      );

      const nextVersion = (current.rows[0]?.version ?? 1) + 1;

      await pool.query(
        `
          INSERT INTO fortexa_policy_history (version, updated_at, updated_by, policy)
          VALUES ($1, $2::timestamptz, $3, $4::jsonb)
        `,
        [nextVersion, now, updatedBy ?? `rollback:${targetVersion}`, JSON.stringify(normalized)]
      );

      await pool.query(
        `
          UPDATE fortexa_policy_state
          SET version = $1,
              updated_at = $2::timestamptz,
              policy = $3::jsonb
          WHERE id = 1
        `,
        [nextVersion, now, JSON.stringify(normalized)]
      );

      return {
        policy: normalized,
        updatedAt: now,
        version: nextVersion,
      };
    });

    if (db.available) {
      return db.value;
    }
  }

  const historyStore = await readHistoryStore();
  const matched = (historyStore.entries ?? []).find((entry) => entry.version === targetVersion);

  if (!matched) {
    throw new Error(`Policy version ${targetVersion} not found.`);
  }

  return updatePolicyConfig(matched.policy, updatedBy ?? `rollback:${targetVersion}`);
}
