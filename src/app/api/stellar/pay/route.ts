import { NextRequest, NextResponse } from "next/server";

import { getOrCreateUserId } from "@/lib/auth/user-id";

export async function POST(request: NextRequest) {
  try {
    const { userId } = getOrCreateUserId(request);

    const payload = (await request.json()) as {
      destination: string;
      amountXLM: string;
      memo?: string;
    };

    if (!payload.destination || !payload.amountXLM) {
      return NextResponse.json({ error: "destination and amountXLM are required" }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "Direct pay endpoint is disabled. Use Freighter flow: /api/stellar/build-payment + /api/stellar/submit-signed.",
        userId,
      },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payment failed." },
      { status: 500 }
    );
  }
}
