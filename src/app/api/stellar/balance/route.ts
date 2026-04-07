import { NextResponse } from "next/server";

import { getAgentPublicKey, getNativeBalance } from "@/lib/stellar/client";

export async function GET() {
  const publicKey = getAgentPublicKey();

  if (!publicKey) {
    return NextResponse.json(
      {
        configured: false,
        message: "Set STELLAR_AGENT_SECRET or STELLAR_AGENT_PUBLIC in .env.local for real wallet mode.",
      },
      { status: 200 }
    );
  }

  try {
    const balance = await getNativeBalance(publicKey);
    return NextResponse.json({ configured: true, publicKey, balance });
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        publicKey,
        error: error instanceof Error ? error.message : "Failed to load balance.",
      },
      { status: 200 }
    );
  }
}
