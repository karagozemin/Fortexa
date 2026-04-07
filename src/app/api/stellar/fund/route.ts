import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { fundWithFriendbot } from "@/lib/stellar/client";
import { getUserWallet } from "@/lib/storage/user-wallet-store";
import { stellarFundRequestSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  const rate = consumeRateLimit(request, {
    key: "stellar-fund",
    limit: 10,
    windowMs: 60_000,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded for friendbot funding." },
      { status: 429, headers: rateLimitHeaders(rate) }
    );
  }

  const rawPayload = (await request.json().catch(() => ({}))) as unknown;
  const parsedPayload = stellarFundRequestSchema.safeParse(rawPayload);

  if (!parsedPayload.success) {
    return NextResponse.json(
      {
        error: "Invalid fund request.",
        details: parsedPayload.error.flatten(),
      },
      { status: 400, headers: rateLimitHeaders(rate) }
    );
  }

  const payload = parsedPayload.data;
  const auth = requireAuth(request, { allowedRoles: ["operator"] });

  if (!auth.ok) {
    return auth.response;
  }

  const userId = auth.session.userId;
  const assignedWallet = await getUserWallet(userId);
  const publicKey = payload.publicKey ?? assignedWallet?.publicKey;

  if (!publicKey || assignedWallet?.source !== "external") {
    return NextResponse.json(
      { error: "Link a Stellar wallet before requesting testnet funding." },
      { status: 400, headers: rateLimitHeaders(rate) }
    );
  }

  try {
    const funded = await fundWithFriendbot(publicKey);
    return NextResponse.json({ ok: true, userId, publicKey, funded }, { headers: rateLimitHeaders(rate) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Funding failed." },
      { status: 500, headers: rateLimitHeaders(rate) }
    );
  }
}
