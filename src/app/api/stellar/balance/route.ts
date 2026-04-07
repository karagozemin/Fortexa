import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getOrCreateUserId, USER_COOKIE_KEY } from "@/lib/auth/user-id";
import { getAgentPublicKey, getNativeBalance } from "@/lib/stellar/client";
import { getUserWallet } from "@/lib/storage/user-wallet-store";

export async function GET(request: NextRequest) {
  const { userId, shouldSetCookie } = getOrCreateUserId(request);
  const assignedWallet = await getUserWallet(userId);
  const publicKey = assignedWallet?.publicKey ?? getAgentPublicKey();

  if (!publicKey) {
    const response = NextResponse.json(
      {
        configured: false,
        userId,
        network: "stellar-testnet",
        message: "Set STELLAR_AGENT_SECRET or STELLAR_AGENT_PUBLIC in .env.local for real wallet mode.",
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
      source: assignedWallet?.source ?? "env",
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
        source: assignedWallet?.source ?? "env",
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
