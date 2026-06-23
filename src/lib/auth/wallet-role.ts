import type { AuthRole } from "@/lib/auth/session";

const STELLAR_PUBLIC_KEY = /^G[A-Z2-7]{55}$/u;

function parseWalletList(value: string | undefined) {
  if (!value?.trim()) {
    return new Set<string>();
  }

  return new Set(
    value
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter((item) => STELLAR_PUBLIC_KEY.test(item))
  );
}

export function normalizeWalletPublicKey(publicKey: string) {
  return publicKey.trim().toUpperCase();
}

export function isValidWalletPublicKey(publicKey: string) {
  return STELLAR_PUBLIC_KEY.test(normalizeWalletPublicKey(publicKey));
}

export function resolveRoleByWallet(publicKey: string): AuthRole | null {
  const normalizedKey = normalizeWalletPublicKey(publicKey);

  const operatorWallets = parseWalletList(process.env.FORTEXA_OPERATOR_WALLETS);
  const viewerWallets = parseWalletList(process.env.FORTEXA_VIEWER_WALLETS);

  if (operatorWallets.has(normalizedKey)) {
    return "operator";
  }

  if (viewerWallets.has(normalizedKey)) {
    return "viewer";
  }

  if (operatorWallets.size === 0 && viewerWallets.size === 0) {
    return "operator";
  }

  return null;
}
