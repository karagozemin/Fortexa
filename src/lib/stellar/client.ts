import {
  Asset,
  Horizon,
  Memo,
  Operation,
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
