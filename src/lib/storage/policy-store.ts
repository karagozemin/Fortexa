import { promises as fs } from "node:fs";
import path from "node:path";

import { defaultPolicyConfig } from "@/lib/policy/engine";
import type { PolicyConfig } from "@/lib/types/domain";

const storeDir = path.join(process.cwd(), ".fortexa");
const storePath = path.join(storeDir, "policy.json");
const historyPath = path.join(storeDir, "policy-history.json");

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
  await fs.mkdir(storeDir, { recursive: true });
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

export async function getPolicyConfig() {
  const store = await readStore();
  return {
    policy: normalizePolicy(store.policy),
    updatedAt: store.updatedAt ?? null,
    version: store.version ?? 1,
  };
}

export async function updatePolicyConfig(nextPolicy: PolicyConfig, updatedBy?: string) {
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
  const historyStore = await readHistoryStore();
  const entries = [...(historyStore.entries ?? [])].sort((left, right) => right.version - left.version);
  return entries.slice(0, Math.max(1, limit));
}

export async function rollbackPolicyVersion(targetVersion: number, updatedBy?: string) {
  const historyStore = await readHistoryStore();
  const matched = (historyStore.entries ?? []).find((entry) => entry.version === targetVersion);

  if (!matched) {
    throw new Error(`Policy version ${targetVersion} not found.`);
  }

  return updatePolicyConfig(matched.policy, updatedBy ?? `rollback:${targetVersion}`);
}
