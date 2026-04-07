import { promises as fs } from "node:fs";
import path from "node:path";

import { defaultPolicyConfig } from "@/lib/policy/engine";
import type { PolicyConfig } from "@/lib/types/domain";

const storeDir = path.join(process.cwd(), ".fortexa");
const storePath = path.join(storeDir, "policy.json");

type PolicyStoreFile = {
  policy: PolicyConfig;
  updatedAt: string;
};

async function ensureStore() {
  await fs.mkdir(storeDir, { recursive: true });
  try {
    await fs.access(storePath);
  } catch {
    const initial: PolicyStoreFile = {
      policy: defaultPolicyConfig,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(storePath, JSON.stringify(initial, null, 2), "utf8");
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
    };

    await fs.writeFile(storePath, JSON.stringify(reset, null, 2), "utf8");
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

async function writeStore(nextPolicy: PolicyConfig) {
  const next: PolicyStoreFile = {
    policy: nextPolicy,
    updatedAt: new Date().toISOString(),
  };

  const tempPath = `${storePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(tempPath, storePath);

  return next;
}

export async function getPolicyConfig() {
  const store = await readStore();
  return {
    policy: normalizePolicy(store.policy),
    updatedAt: store.updatedAt ?? null,
  };
}

export async function updatePolicyConfig(nextPolicy: PolicyConfig) {
  return writeStore(nextPolicy);
}
