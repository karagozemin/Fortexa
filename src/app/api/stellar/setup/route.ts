import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getOrCreateUserId, USER_COOKIE_KEY } from "@/lib/auth/user-id";
import { fundWithFriendbot } from "@/lib/stellar/client";
import { upsertUserWallet } from "@/lib/storage/user-wallet-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      publicKey?: string;
      fund?: boolean;
      provider?: string;
    };

    const { userId, shouldSetCookie } = getOrCreateUserId(request);
    const shouldFund = body.fund ?? true;

    if (!body.publicKey) {
      return NextResponse.json({ error: "Stellar publicKey is required." }, { status: 400 });
    }

    const assignedPublicKey = body.publicKey;
    await upsertUserWallet(userId, {
      publicKey: assignedPublicKey,
      source: "external",
      provider: body.provider?.trim() || "unknown",
    });

    if (shouldFund) {
      await fundWithFriendbot(assignedPublicKey);
    }

    const response = NextResponse.json({
      ok: true,
      userId,
      source: "external",
      provider: body.provider?.trim() || "unknown",
      network: "stellar-testnet",
      publicKey: assignedPublicKey,
      message: "Stellar wallet address linked to this user and optionally funded on testnet.",
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to setup Stellar testnet wallet." },
      { status: 500 }
    );
  }
}
