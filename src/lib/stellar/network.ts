import { Networks } from "@stellar/stellar-sdk";

export const STELLAR_PUBLIC_NETWORK_PASSPHRASE = Networks.PUBLIC;
export const STELLAR_TESTNET_NETWORK_PASSPHRASE = Networks.TESTNET;

function normalizeEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function getStellarNetworkPassphrase(
  env: NodeJS.ProcessEnv = process.env
) {
  return (
    normalizeEnvValue(env.STELLAR_NETWORK_PASSPHRASE) ??
    STELLAR_TESTNET_NETWORK_PASSPHRASE
  );
}

export function getStellarHorizonUrl(
  env: NodeJS.ProcessEnv = process.env
) {
  return (
    normalizeEnvValue(env.STELLAR_HORIZON_URL) ??
    "https://horizon-testnet.stellar.org"
  );
}

export function inferStellarNetworkFromHorizonUrl(url: string):
  | "public"
  | "testnet"
  | "unknown" {
  try {
    const parsed = new URL(url);
    const normalized = `${parsed.hostname}${parsed.pathname}`.toLowerCase();

    if (normalized.includes("testnet")) {
      return "testnet";
    }

    if (
      normalized.includes("horizon.stellar.org") ||
      normalized.includes("mainnet")
    ) {
      return "public";
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

export function getStellarExplorerTransactionUrl(
  hash: string,
  passphrase = getStellarNetworkPassphrase()
) {
  const networkSegment =
    passphrase === STELLAR_PUBLIC_NETWORK_PASSPHRASE
      ? "public"
      : "testnet";

  return `https://stellar.expert/explorer/${networkSegment}/tx/${hash}`;
}
