import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { getWalletFromSession } from "@/lib/auth/session-wallet";
import { getNativeBalance } from "@/lib/stellar/client";
import { getUserWallet, upsertUserWallet } from "@/lib/storage/user-wallet-store";

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const userId = auth.session.userId;
  let assignedWallet = await getUserWallet(userId);
  let publicKey = assignedWallet?.publicKey;

  if (!publicKey || assignedWallet?.source !== "external") {
    const sessionWallet = getWalletFromSession(auth.session);
    if (sessionWallet) {
      assignedWallet = await upsertUserWallet(userId, {
        publicKey: sessionWallet,
        source: "external",
        provider: assignedWallet?.provider ?? "login",
      });
      publicKey = assignedWallet.publicKey;
    }
  }

  if (!publicKey || assignedWallet?.source !== "external") {
    return NextResponse.json(
      {
        configured: false,
        userId,
        network: "stellar-testnet",
        message: "Link your Stellar wallet address to continue with real on-chain transactions.",
      },
      { status: 200 }
    );
  }

  try {
    const balance = await getNativeBalance(publicKey);
    return NextResponse.json({
      configured: true,
      userId,
      source: assignedWallet.source,
      provider: assignedWallet.provider ?? "unknown",
      network: "stellar-testnet",
      publicKey,
      balance,
    });
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        userId,
        source: assignedWallet.source,
        provider: assignedWallet.provider ?? "unknown",
        network: "stellar-testnet",
        publicKey,
        error: error instanceof Error ? error.message : "Failed to load balance.",
      },
      { status: 200 }
    );
  }
}
