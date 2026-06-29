import { Networks } from "@stellar/stellar-sdk";

export type CheckStatus = "pass" | "warn" | "fail";

export type CheckItem = {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
};

const PLACEHOLDER_PATTERNS = [
  /your[-_]?[a-z]+/i,
  /placeholder/i,
  /replace[-_]?me/i,
  /todo/i,
  /example\.com/i,
  /localhost/i,
  /127\.0\.0\.1/i,
  /REPLACE/i,
  /CHANGEME/i,
  /xxx/i,
];

function looksLikePlaceholder(value: string | undefined): boolean {
  if (!value) return false;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value));
}

function inferNetworkProfile(horizonUrl: string): "testnet" | "public" | "custom" {
  const normalized = horizonUrl.trim().toLowerCase();

  if (normalized.includes("testnet")) {
    return "testnet";
  }

  if (
    normalized.includes("localhost") ||
    normalized.includes("127.0.0.1") ||
    normalized.includes(".local") ||
    normalized.includes("-mock.") ||
    normalized.includes("horizon-mock")
  ) {
    return "custom";
  }

  if (
    normalized.includes("horizon.stellar.org") ||
    normalized.includes("horizon-mainnet") ||
    normalized.includes("/public")
  ) {
    return "public";
  }

  return "custom";
}

export function runSelfChecks(isProduction: boolean): CheckItem[] {
  const checks: CheckItem[] = [];

  const horizonUrl = process.env.STELLAR_HORIZON_URL ?? "";
  const passphrase = process.env.STELLAR_NETWORK_PASSPHRASE ?? "";
  const profile = inferNetworkProfile(horizonUrl);
  const expectedTestnet = profile === "testnet";

  checks.push({
    id: "network-mode",
    label: "Network mode",
    status: expectedTestnet ? "pass" : "warn",
    detail: expectedTestnet ? "Testnet" : profile === "public" ? "Public / mainnet" : "Custom",
  });

  if (horizonUrl) {
    checks.push({ id: "horizon-url", label: "Horizon URL", status: "pass", detail: horizonUrl });
  } else {
    checks.push({ id: "horizon-url", label: "Horizon URL", status: "fail", detail: "Missing STELLAR_HORIZON_URL" });
  }

  if (expectedTestnet && passphrase && passphrase !== Networks.TESTNET) {
    checks.push({
      id: "passphrase-consistency",
      label: "Network passphrase",
      status: "fail",
      detail: "Mismatch: URL points to testnet but passphrase does not",
    });
  } else if (!expectedTestnet && passphrase && passphrase !== Networks.PUBLIC) {
    checks.push({
      id: "passphrase-consistency",
      label: "Network passphrase",
      status: "warn",
      detail: "Passphrase does not match public network",
    });
  } else {
    checks.push({ id: "passphrase-consistency", label: "Network passphrase", status: "pass", detail: "Consistent" });
  }

  const explorerUrl = process.env.NEXT_PUBLIC_STELLAR_EXPLORER_URL ?? "";
  if (explorerUrl) {
    checks.push({ id: "explorer-url", label: "Explorer base URL", status: "pass", detail: explorerUrl });
  } else {
    checks.push({ id: "explorer-url", label: "Explorer base URL", status: "warn", detail: "Not configured (NEXT_PUBLIC_STELLAR_EXPLORER_URL)" });
  }

  const isMainnet = profile === "public";
  if (isMainnet) {
    checks.push({ id: "mainnet-flag", label: "Mainnet flag", status: "warn", detail: "Mainnet active" });
  } else {
    checks.push({ id: "mainnet-flag", label: "Mainnet flag", status: "pass", detail: "Testnet / custom" });
  }

  const publicEnvEntries = Object.entries(process.env).filter(([key]) => key.startsWith("NEXT_PUBLIC_"));
  const placeholderFound = publicEnvEntries.some(([, value]) => looksLikePlaceholder(value));
  if (placeholderFound) {
    checks.push({
      id: "placeholder-values",
      label: "Placeholder values",
      status: isProduction ? "fail" : "warn",
      detail: isProduction ? "Placeholder detected in production build" : "Placeholder detected in env",
    });
  } else {
    checks.push({ id: "placeholder-values", label: "Placeholder values", status: "pass", detail: "None detected" });
  }

  const coordinatorUrl = process.env.NEXT_PUBLIC_COORDINATOR_URL ?? "";
  if (coordinatorUrl) {
    checks.push({ id: "coordinator-url", label: "Coordinator URL", status: "pass", detail: coordinatorUrl });
  } else {
    checks.push({ id: "coordinator-url", label: "Coordinator URL", status: "warn", detail: "Not configured (same-origin default)" });
  }

  const contractIds = process.env.NEXT_PUBLIC_CONTRACT_IDS ?? "";
  if (contractIds) {
    checks.push({ id: "contract-ids", label: "Contract IDs", status: "pass", detail: "Configured" });
  } else {
    checks.push({ id: "contract-ids", label: "Contract IDs", status: "warn", detail: "Not configured (Soroban not in use)" });
  }

  return checks;
}
