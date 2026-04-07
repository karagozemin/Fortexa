import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getOrCreateUserId, USER_COOKIE_KEY } from "@/lib/auth/user-id";
import { fundWithFriendbot } from "@/lib/stellar/client";
import { getUserWallet } from "@/lib/storage/user-wallet-store";

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as { publicKey?: string };
  const { userId, shouldSetCookie } = getOrCreateUserId(request);
  const assignedWallet = await getUserWallet(userId);
  const publicKey = payload.publicKey ?? assignedWallet?.publicKey;

  if (!publicKey || assignedWallet?.source !== "external") {
    return NextResponse.json({ error: "Link a Stellar wallet before requesting testnet funding." }, { status: 400 });
  }

  try {
    const funded = await fundWithFriendbot(publicKey);
    const response = NextResponse.json({ ok: true, userId, publicKey, funded });

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
      { error: error instanceof Error ? error.message : "Funding failed." },
      { status: 500 }
    );
  }
}
