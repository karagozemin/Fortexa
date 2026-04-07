import {
  Asset,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import type { StellarPaymentRequest } from "@/lib/types/domain";

const HORIZON_URL = process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const FRIEND_BOT_URL = process.env.STELLAR_FRIENDBOT_URL ?? "https://friendbot.stellar.org";

export function getHorizonServer() {
  return new Horizon.Server(HORIZON_URL);
}

export function getAgentKeypair() {
  const secret = process.env.STELLAR_AGENT_SECRET;
  if (!secret) {
    return null;
  }
  return Keypair.fromSecret(secret);
}

export function getKeypairFromSecret(secret?: string | null) {
  if (!secret) {
    return null;
  }
  return Keypair.fromSecret(secret);
}

export function getAgentPublicKey() {
  const fromSecret = getAgentKeypair();
  if (fromSecret) {
    return fromSecret.publicKey();
  }
  return process.env.STELLAR_AGENT_PUBLIC ?? null;
}

export async function getNativeBalance(publicKey: string) {
  const server = getHorizonServer();
  const account = await server.loadAccount(publicKey);
  const native = account.balances.find((balance) => balance.asset_type === "native");
  return native?.balance ?? "0";
}

export async function fundWithFriendbot(publicKey: string) {
  const response = await fetch(`${FRIEND_BOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Friendbot failed: ${text}`);
  }
  return response.json();
}

export async function sendPayment(request: StellarPaymentRequest) {
  return sendPaymentWithSecret(request, process.env.STELLAR_AGENT_SECRET);
}

export async function sendPaymentWithSecret(request: StellarPaymentRequest, secret?: string | null) {
  const keypair = getKeypairFromSecret(secret);

  if (!keypair) {
    return {
      mode: "simulated" as const,
      hash: `SIM-${Date.now()}`,
      status: "No STELLAR_AGENT_SECRET provided, returned simulated payment result.",
    };
  }

  const server = getHorizonServer();
  const sourceAccount = await server.loadAccount(keypair.publicKey());

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: (await server.fetchBaseFee()).toString(),
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: request.destination,
        asset: Asset.native(),
        amount: request.amountXLM,
      })
    )
    .addMemo(Memo.text(request.memo?.slice(0, 28) ?? "Fortexa payment"))
    .setTimeout(30)
    .build();

  transaction.sign(keypair);
  const submitted = await server.submitTransaction(transaction);

  return {
    mode: "real" as const,
    hash: submitted.hash,
    status: submitted.successful ? "submitted" : "unknown",
    ledger: submitted.ledger,
    resultXdr: submitted.result_xdr,
  };
}

export async function buildUnsignedPaymentTransaction(request: StellarPaymentRequest, sourcePublicKey: string) {
  const server = getHorizonServer();
  const sourceAccount = await server.loadAccount(sourcePublicKey);

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: (await server.fetchBaseFee()).toString(),
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: request.destination,
        asset: Asset.native(),
        amount: request.amountXLM,
      })
    )
    .addMemo(Memo.text(request.memo?.slice(0, 28) ?? "Fortexa payment"))
    .setTimeout(30)
    .build();

  return {
    xdr: transaction.toXDR(),
    networkPassphrase: Networks.TESTNET,
  };
}

export async function submitSignedTransactionXdr(signedXdr: string) {
  const server = getHorizonServer();
  const transaction = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
  const submitted = await server.submitTransaction(transaction);

  return {
    hash: submitted.hash,
    status: submitted.successful ? "submitted" : "unknown",
    ledger: submitted.ledger,
    resultXdr: submitted.result_xdr,
  };
}
