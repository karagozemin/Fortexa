import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { getWalletFromSession } from "@/lib/auth/session-wallet";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
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

    const auth = requireAuth(request);

    if (!auth.ok) {
      return auth.response;
    }

    const sessionWallet = getWalletFromSession(auth.session);
    if (!sessionWallet) {
      return NextResponse.json(
        { error: "Session is not bound to a valid Stellar wallet." },
        { status: 400, headers: rateLimitHeaders(rate) }
      );
    }

    const userId = auth.session.userId;

    await upsertUserWallet(userId, {
      publicKey: sessionWallet,
      source: "external",
      provider: parsedBody.data.provider?.trim() || "login",
    });

    return NextResponse.json(
      {
        ok: true,
        userId,
        source: "external",
        provider: parsedBody.data.provider?.trim() || "login",
        network: "stellar-testnet",
        publicKey: sessionWallet,
        message: "Session wallet synced for transaction execution.",
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
