import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { fundWithFriendbot } from "@/lib/stellar/client";
import { upsertUserWallet } from "@/lib/storage/user-wallet-store";
import { stellarSetupRequestSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rate = consumeRateLimit(request, {
    key: "stellar-setup",
    limit: 20,
    windowMs: 60_000,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded for wallet setup." },
      { status: 429, headers: rateLimitHeaders(rate) }
    );
  }

  try {
    const rawBody = (await request.json().catch(() => ({}))) as unknown;
    const parsedBody = stellarSetupRequestSchema.safeParse(rawBody);

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: "Invalid wallet setup request.",
          details: parsedBody.error.flatten(),
        },
        { status: 400, headers: rateLimitHeaders(rate) }
      );
    }

    const body = parsedBody.data;

    const auth = requireAuth(request, { allowedRoles: ["operator"] });

    if (!auth.ok) {
      return auth.response;
    }

    const userId = auth.session.userId;
    const shouldFund = body.fund ?? true;

    const assignedPublicKey = body.publicKey;
    await upsertUserWallet(userId, {
      publicKey: assignedPublicKey,
      source: "external",
      provider: body.provider?.trim() || "unknown",
    });

    if (shouldFund) {
      await fundWithFriendbot(assignedPublicKey);
    }

    return NextResponse.json(
      {
        ok: true,
        userId,
        source: "external",
        provider: body.provider?.trim() || "unknown",
        network: "stellar-testnet",
        publicKey: assignedPublicKey,
        message: "Stellar wallet address linked to this user and optionally funded on testnet.",
      },
      { headers: rateLimitHeaders(rate) }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to setup Stellar testnet wallet." },
      { status: 500, headers: rateLimitHeaders(rate) }
    );
  }
}
