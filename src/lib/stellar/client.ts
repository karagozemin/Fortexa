import {
  Asset,
  FeeBumpTransaction,
  Horizon,
  Memo,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import type { StellarPaymentRequest } from "@/lib/types/domain";
import { assertStellarNetworkConfig, getStellarHorizonUrl } from "@/lib/stellar/network-config";

export function getHorizonServer() {
  const { horizonUrl } = assertStellarNetworkConfig();
  return new Horizon.Server(horizonUrl);
}

export async function getNativeBalance(publicKey: string) {
  const server = getHorizonServer();
  const account = await server.loadAccount(publicKey);
  const native = account.balances.find((balance) => balance.asset_type === "native");
  return native?.balance ?? "0";
}

export async function buildUnsignedPaymentTransaction(request: StellarPaymentRequest, sourcePublicKey: string) {
  const { networkPassphrase } = assertStellarNetworkConfig();
  const server = getHorizonServer();
  const sourceAccount = await server.loadAccount(sourcePublicKey);

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: (await server.fetchBaseFee()).toString(),
    networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: request.destination,
        asset: Asset.native(),
        amount: request.amountXLM,
      })
    )
    .addMemo(Memo.text(request.memo?.slice(0, 28) ?? "Fortexa payment"))
    .setTimeout(180)
    .build();

  return {
    xdr: transaction.toXDR(),
    networkPassphrase,
  };
}

export type SignedXdrSourceResult =
  | { ok: true; sourceAccount: string; isFeeBump: boolean }
  | { ok: false; reason: "malformed" };

/**
 * Decodes a signed transaction XDR (without submitting it to Horizon) and
 * extracts the transaction-level source account.
 *
 * For a regular Transaction, this is `transaction.source`.
 * For a FeeBumpTransaction, the outer envelope's `source`/`feeSource` pays
 * the fee but does not "own" the operations, so we resolve to the inner
 * transaction's source account instead — that's the account whose signed
 * intent actually matches the session wallet.
 *
 * Returns `{ ok: false, reason: "malformed" }` instead of throwing so
 * callers can return a clean 400 response.
 */
export function decodeSignedXdrSourceAccount(signedXdr: string): SignedXdrSourceResult {
  const { networkPassphrase } = assertStellarNetworkConfig();

  let decoded: Transaction | FeeBumpTransaction;
  try {
    decoded = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (decoded instanceof FeeBumpTransaction) {
    return {
      ok: true,
      sourceAccount: decoded.innerTransaction.source,
      isFeeBump: true,
    };
  }

  return { ok: true, sourceAccount: decoded.source, isFeeBump: false };
}

export async function submitSignedTransactionXdr(signedXdr: string) {
  const { networkPassphrase } = assertStellarNetworkConfig();
  const server = getHorizonServer();
  const transaction = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  const submitted = await server.submitTransaction(transaction);

  return {
    hash: submitted.hash,
    status: submitted.successful ? "submitted" : "unknown",
    ledger: submitted.ledger,
    resultXdr: submitted.result_xdr,
  };
}

export { getStellarHorizonUrl };