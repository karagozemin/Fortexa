import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getOrCreateUserId, USER_COOKIE_KEY } from "@/lib/auth/user-id";
import { buildUnsignedPaymentTransaction } from "@/lib/stellar/client";
import { getUserWallet } from "@/lib/storage/user-wallet-store";

export async function POST(request: NextRequest) {
  try {
    const { userId, shouldSetCookie } = getOrCreateUserId(request);
    const assignedWallet = await getUserWallet(userId);

    const payload = (await request.json()) as {
      destination: string;
      amountXLM: string;
      memo?: string;
    };

    if (!payload.destination || !payload.amountXLM) {
      return NextResponse.json({ error: "destination and amountXLM are required" }, { status: 400 });
    }

    const sourcePublicKey = assignedWallet?.publicKey;

    if (!sourcePublicKey || assignedWallet?.source !== "external") {
      return NextResponse.json({ error: "A linked Stellar wallet is required before building transactions." }, { status: 400 });
    }

    const unsigned = await buildUnsignedPaymentTransaction(payload, sourcePublicKey);

    const response = NextResponse.json({
      ok: true,
      userId,
      source: assignedWallet.source,
      provider: assignedWallet.provider ?? "unknown",
      sourcePublicKey,
      xdr: unsigned.xdr,
      networkPassphrase: unsigned.networkPassphrase,
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
      { error: error instanceof Error ? error.message : "Failed to build payment transaction." },
      { status: 500 }
    );
  }
}
