/**
 * verify-xdr-source.ts
 *
 * Decodes a base64-encoded signed XDR and verifies that the transaction
 * source account matches the authenticated session wallet.
 *
 * This is a defense-in-depth check only — no signing or custody occurs here.
 *
 * Issue: #26
 */

import { TransactionBuilder, Networks, xdr } from '@stellar/stellar-sdk';

export type VerifyResult =
  | { ok: true;  sourceAccount: string }
  | { ok: false; reason: 'malformed_xdr' | 'wrong_network' | 'source_mismatch' | 'missing_wallet'; detail: string };

/**
 * Decodes the signed XDR envelope and returns the source account public key.
 * Throws if the XDR is malformed or cannot be parsed.
 */
export function decodeXdrSource(signedXdr: string): string {
  // TransactionBuilder.fromXDR throws on malformed input — we let it bubble
  // so callers can catch and return 400.
  const tx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
  return tx.sou
}

/**
 * Full verification pipeline:
 *  1. Decode the XDR (reject malformed)
 *  2. Confirm it targets Testnet (reject mainnet or unknown)
 *  3. Look up the session wallet from the store
 *  4. Compare source account against session wallet
 *
 * @param signedXdr  - Raw base64-encoded signed transaction envelope
 * @param sessionKey - The key used to look up the wallet in the store
 *                     (e.g. a user ID or session token)
 * @param getWallet  - Injected wallet-store lookup (keeps this fn pure/testable)
 */
export function verifyXdrSource(
  signedXdr: string,
  sessionKey: string,
  getWallet: (key: string) => string | null | undefined,
): VerifyResult {
  // ── 1. Decode ────────────────────────────────────────────────────────────
  let sourceAccount: string;
  try {
    sourceAccount = decodeXdrSource(signedXdr);
  } catch {
    return {
      ok: false,
      reas. Wallet lookup ─────────────────────────────────────────────────────
  const sessionWallet = getWallet(sessionKey);
  if (!sessionWallet) {
    return {
      ok: false,
      reason: 'missing_wallet',
      detail: `No wallet mapping found for session key "${sessionKey}".`,
    };
  }

  // ── 3. Source match ──────────────────────────────────────────────────────
  if (sourceAccount !== sessionWallet) {
    return {
      ok: false,
      reason: 'source_mismatch',
      detail: `XDR source "${sourceAccount}" does not match session wallet "${sessionWallet}".`,
    };
  }

  return { ok: true, sourceAccount };
}
