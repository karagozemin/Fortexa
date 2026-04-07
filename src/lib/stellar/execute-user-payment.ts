import { sendPaymentWithSecret } from "@/lib/stellar/client";
import { getUserWallet } from "@/lib/storage/user-wallet-store";
import type { StellarPaymentRequest } from "@/lib/types/domain";

export async function executePaymentForUser(userId: string, payload: StellarPaymentRequest) {
  const assignedWallet = await getUserWallet(userId);

  const signingSecret = assignedWallet
    ? assignedWallet.source === "custodial"
      ? assignedWallet.secret
      : null
    : process.env.STELLAR_AGENT_SECRET;

  const payment = await sendPaymentWithSecret(payload, signingSecret);

  return {
    payment,
    source: assignedWallet?.source ?? "env",
    sourcePublicKey: assignedWallet?.publicKey ?? process.env.STELLAR_AGENT_PUBLIC ?? null,
    isFreighterNonCustodial: assignedWallet?.source === "freighter",
  };
}
