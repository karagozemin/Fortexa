import path from "node:path";

import {
  STELLAR_PUBLIC_NETWORK_PASSPHRASE,
  STELLAR_TESTNET_NETWORK_PASSPHRASE,
  getStellarHorizonUrl,
  getStellarNetworkPassphrase,
  inferStellarNetworkFromHorizonUrl,
} from "@/lib/stellar/network";

const STELLAR_PUBLIC_KEY = /^G[A-Z2-7]{55}$/u;
const MIN_AUTH_SECRET_LENGTH = 32;

export type ProductionReadinessIssue = {
  setting: string;
  message: string;
  remediation: string;
};

export type ProductionReadinessReport = {
  ok: boolean;
  issues: ProductionReadinessIssue[];
};

type ProductionReadinessOptions = {
  cwd?: string;
};

function normalizeConfiguredValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function normalizeConfiguredPath(
  configuredPath: string,
  cwd: string
) {
  return path.normalize(
    path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(cwd, configuredPath)
  );
}

function isValidHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function countWallets(value: string | undefined) {
  if (!value?.trim()) {
    return 0;
  }

  return value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item) => STELLAR_PUBLIC_KEY.test(item)).length;
}

function isUnsafeFileStoreDefault(
  configuredStoreDir: string,
  cwd: string
) {
  const resolved = normalizeConfiguredPath(configuredStoreDir, cwd);
  const unsafeDefaults = [
    path.normalize(path.join(cwd, ".fortexa")),
    path.normalize(path.join("/tmp", "fortexa")),
  ];

  return unsafeDefaults.includes(resolved);
}

function addIssue(
  issues: ProductionReadinessIssue[],
  setting: string,
  message: string,
  remediation: string
) {
  issues.push({ setting, message, remediation });
}

export function checkProductionReadiness(
  env: NodeJS.ProcessEnv = process.env,
  options: ProductionReadinessOptions = {}
): ProductionReadinessReport {
  const cwd = options.cwd ?? process.cwd();
  const issues: ProductionReadinessIssue[] = [];

  const horizonUrl = normalizeConfiguredValue(env.STELLAR_HORIZON_URL);
  if (!horizonUrl) {
    addIssue(
      issues,
      "STELLAR_HORIZON_URL",
      "Stellar Horizon URL is missing.",
      "Set STELLAR_HORIZON_URL to your production Horizon endpoint."
    );
  } else if (!isValidHttpsUrl(horizonUrl)) {
    addIssue(
      issues,
      "STELLAR_HORIZON_URL",
      "Stellar Horizon URL must be a valid HTTPS URL.",
      "Update STELLAR_HORIZON_URL to an HTTPS Horizon endpoint reachable from production."
    );
  }

  const networkPassphrase = normalizeConfiguredValue(
    env.STELLAR_NETWORK_PASSPHRASE
  );
  if (!networkPassphrase) {
    addIssue(
      issues,
      "STELLAR_NETWORK_PASSPHRASE",
      "Stellar network passphrase is missing.",
      "Set STELLAR_NETWORK_PASSPHRASE to the Stellar public network passphrase for production."
    );
  } else if (networkPassphrase !== STELLAR_PUBLIC_NETWORK_PASSPHRASE) {
    const reason =
      networkPassphrase === STELLAR_TESTNET_NETWORK_PASSPHRASE
        ? "Testnet passphrase is still configured."
        : "Configured passphrase does not match the Stellar public network.";
    addIssue(
      issues,
      "STELLAR_NETWORK_PASSPHRASE",
      reason,
      "Set STELLAR_NETWORK_PASSPHRASE to the Stellar public network passphrase before deployment."
    );
  }

  if (horizonUrl) {
    const inferredNetwork = inferStellarNetworkFromHorizonUrl(
      getStellarHorizonUrl({ ...env, STELLAR_HORIZON_URL: horizonUrl })
    );

    if (inferredNetwork === "testnet") {
      addIssue(
        issues,
        "STELLAR_HORIZON_URL",
        "Testnet Horizon is an unsafe production default.",
        "Point STELLAR_HORIZON_URL at a public-network Horizon service for production payments."
      );
    }

    if (
      networkPassphrase === STELLAR_PUBLIC_NETWORK_PASSPHRASE &&
      inferredNetwork === "testnet"
    ) {
      addIssue(
        issues,
        "STELLAR_HORIZON_URL, STELLAR_NETWORK_PASSPHRASE",
        "Horizon URL and network passphrase target different Stellar networks.",
        "Use a public-network Horizon URL together with the public network passphrase."
      );
    }
  }

  const authSecret = normalizeConfiguredValue(env.FORTEXA_AUTH_SECRET);
  if (!authSecret) {
    addIssue(
      issues,
      "FORTEXA_AUTH_SECRET",
      "Auth signing secret is missing.",
      "Set FORTEXA_AUTH_SECRET to a strong random value of at least 32 characters."
    );
  } else if (authSecret.length < MIN_AUTH_SECRET_LENGTH) {
    addIssue(
      issues,
      "FORTEXA_AUTH_SECRET",
      "Auth signing secret is too short for production use.",
      "Rotate FORTEXA_AUTH_SECRET to a strong random value of at least 32 characters."
    );
  }

  if (countWallets(env.FORTEXA_OPERATOR_WALLETS) === 0) {
    addIssue(
      issues,
      "FORTEXA_OPERATOR_WALLETS",
      "Operator wallet allowlist is empty, which leaves the demo operator fallback active.",
      "Set FORTEXA_OPERATOR_WALLETS to one or more production operator Stellar public keys."
    );
  }

  const databaseUrl = normalizeConfiguredValue(env.DATABASE_URL);
  const storeDir = normalizeConfiguredValue(env.FORTEXA_STORE_DIR);
  if (!databaseUrl && !storeDir) {
    addIssue(
      issues,
      "DATABASE_URL or FORTEXA_STORE_DIR",
      "No persistent storage backend is explicitly configured.",
      "Configure DATABASE_URL for Postgres or set FORTEXA_STORE_DIR to a durable production storage path."
    );
  } else if (storeDir && isUnsafeFileStoreDefault(storeDir, cwd)) {
    addIssue(
      issues,
      "FORTEXA_STORE_DIR",
      "File storage points at a local demo default path.",
      "Set FORTEXA_STORE_DIR to a durable production path, or prefer DATABASE_URL for managed persistence."
    );
  }

  const redisUrl = normalizeConfiguredValue(env.REDIS_URL);
  const sharedStatePath = normalizeConfiguredValue(
    env.FORTEXA_SHARED_STATE_PATH
  );
  if (!redisUrl && !sharedStatePath) {
    addIssue(
      issues,
      "REDIS_URL or FORTEXA_SHARED_STATE_PATH",
      "Shared lockout and rate-limit state is not configured.",
      "Configure REDIS_URL for multi-instance deployments or FORTEXA_SHARED_STATE_PATH for a shared file-backed state store."
    );
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function formatProductionReadinessReport(
  report: ProductionReadinessReport
) {
  if (report.ok) {
    return "Fortexa production readiness check passed.";
  }

  const lines = ["Fortexa production readiness check failed:"];

  for (const issue of report.issues) {
    lines.push(`- ${issue.setting}: ${issue.message} ${issue.remediation}`);
  }

  return lines.join("\n");
}
