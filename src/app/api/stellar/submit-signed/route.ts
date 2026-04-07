import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getOrCreateUserId, USER_COOKIE_KEY } from "@/lib/auth/user-id";
import { submitSignedTransactionXdr } from "@/lib/stellar/client";

export async function POST(request: NextRequest) {
  try {
    const { userId, shouldSetCookie } = getOrCreateUserId(request);

    const payload = (await request.json()) as {
      signedXdr: string;
    };

    if (!payload.signedXdr) {
      return NextResponse.json({ error: "signedXdr is required" }, { status: 400 });
    }

    const submitted = await submitSignedTransactionXdr(payload.signedXdr);

    const response = NextResponse.json({
      ok: true,
      userId,
      payment: {
        mode: "real",
        ...submitted,
      },
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
      { error: error instanceof Error ? error.message : "Failed to submit signed transaction." },
      { status: 500 }
    );
  }
}
