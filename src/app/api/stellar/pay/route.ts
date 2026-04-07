import { NextResponse } from "next/server";

import { sendPayment } from "@/lib/stellar/client";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      destination: string;
      amountXLM: string;
      memo?: string;
    };

    if (!payload.destination || !payload.amountXLM) {
      return NextResponse.json({ error: "destination and amountXLM are required" }, { status: 400 });
    }

    const payment = await sendPayment(payload);

    return NextResponse.json({ ok: true, payment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payment failed." },
      { status: 500 }
    );
  }
}
