import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getOrCreateUserId, USER_COOKIE_KEY } from "@/lib/auth/user-id";
import { sendPaymentWithSecret } from "@/lib/stellar/client";
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

    const signingSecret = assignedWallet
      ? assignedWallet.source === "custodial"
        ? assignedWallet.secret
        : null
      : process.env.STELLAR_AGENT_SECRET;

    const payment = await sendPaymentWithSecret(payload, signingSecret);

    const response = NextResponse.json({
      ok: true,
      userId,
      source: assignedWallet?.source ?? "env",
      sourcePublicKey: assignedWallet?.publicKey ?? process.env.STELLAR_AGENT_PUBLIC ?? null,
      payment,
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
      { error: error instanceof Error ? error.message : "Payment failed." },
      { status: 500 }
    );
  }
}
