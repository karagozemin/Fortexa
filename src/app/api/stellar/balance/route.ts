import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getOrCreateUserId, USER_COOKIE_KEY } from "@/lib/auth/user-id";
import { getNativeBalance } from "@/lib/stellar/client";
import { getUserWallet } from "@/lib/storage/user-wallet-store";

export async function GET(request: NextRequest) {
  const { userId, shouldSetCookie } = getOrCreateUserId(request);
  const assignedWallet = await getUserWallet(userId);
  const publicKey = assignedWallet?.publicKey;

  if (!publicKey || assignedWallet?.source !== "freighter") {
    const response = NextResponse.json(
      {
        configured: false,
        userId,
        network: "stellar-testnet",
        message: "Connect your Freighter wallet to continue with real on-chain transactions.",
      },
      { status: 200 }
    );

    if (shouldSetCookie) {
      response.cookies.set(USER_COOKIE_KEY, userId ?? randomUUID(), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return response;
  }

  try {
    const balance = await getNativeBalance(publicKey);
    const response = NextResponse.json({
      configured: true,
      userId,
      source: assignedWallet.source,
      network: "stellar-testnet",
      publicKey,
      balance,
    });

    if (shouldSetCookie) {
      response.cookies.set(USER_COOKIE_KEY, userId ?? randomUUID(), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return response;
  } catch (error) {
    const response = NextResponse.json(
      {
        configured: true,
        userId,
        source: assignedWallet.source,
        network: "stellar-testnet",
        publicKey,
        error: error instanceof Error ? error.message : "Failed to load balance.",
      },
      { status: 200 }
    );

    if (shouldSetCookie) {
      response.cookies.set(USER_COOKIE_KEY, userId ?? randomUUID(), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return response;
  }
}
