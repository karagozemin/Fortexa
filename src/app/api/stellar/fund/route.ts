import { NextResponse } from "next/server";

import { fundWithFriendbot, getAgentPublicKey } from "@/lib/stellar/client";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { publicKey?: string };
  const publicKey = payload.publicKey ?? getAgentPublicKey();

  if (!publicKey) {
    return NextResponse.json({ error: "No public key provided or configured." }, { status: 400 });
  }

  try {
    const funded = await fundWithFriendbot(publicKey);
    return NextResponse.json({ ok: true, funded });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Funding failed." },
      { status: 500 }
    );
  }
}
