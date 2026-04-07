import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getOrCreateUserId, USER_COOKIE_KEY } from "@/lib/auth/user-id";
import { executePaymentForUser } from "@/lib/stellar/execute-user-payment";

export async function POST(request: NextRequest) {
  try {
    const { userId, shouldSetCookie } = getOrCreateUserId(request);

    const payload = (await request.json()) as {
      destination: string;
      amountXLM: string;
      memo?: string;
    };

    if (!payload.destination || !payload.amountXLM) {
      return NextResponse.json({ error: "destination and amountXLM are required" }, { status: 400 });
    }

    const paymentResult = await executePaymentForUser(userId, payload);

    const response = NextResponse.json({
      ok: true,
      userId,
      source: paymentResult.source,
      sourcePublicKey: paymentResult.sourcePublicKey,
      payment: paymentResult.payment,
      note: paymentResult.isFreighterNonCustodial
        ? "Freighter-linked wallet requires extension-side signing flow for real submission."
        : undefined,
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
