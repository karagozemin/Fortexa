import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { buildUnsignedPaymentTransaction } from "@/lib/stellar/client";
import { getUserWallet } from "@/lib/storage/user-wallet-store";
import { stellarBuildPaymentRequestSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  const rate = consumeRateLimit(request, {
    key: "stellar-build-payment",
    limit: 30,
    windowMs: 60_000,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded for payment build endpoint." },
      { status: 429, headers: rateLimitHeaders(rate) }
    );
  }

  try {
    const auth = requireAuth(request, { allowedRoles: ["operator"] });

    if (!auth.ok) {
      return auth.response;
    }

    const userId = auth.session.userId;
    const assignedWallet = await getUserWallet(userId);

    const rawPayload = (await request.json().catch(() => ({}))) as unknown;
    const parsedPayload = stellarBuildPaymentRequestSchema.safeParse(rawPayload);

    if (!parsedPayload.success) {
      return NextResponse.json(
        {
          error: "Invalid payment build request.",
          details: parsedPayload.error.flatten(),
        },
        { status: 400, headers: rateLimitHeaders(rate) }
      );
    }

    const payload = parsedPayload.data;

    const sourcePublicKey = assignedWallet?.publicKey;

    if (!sourcePublicKey || assignedWallet?.source !== "external") {
      return NextResponse.json(
        { error: "A linked Stellar wallet is required before building transactions." },
        { status: 400, headers: rateLimitHeaders(rate) }
      );
    }

    const unsigned = await buildUnsignedPaymentTransaction(payload, sourcePublicKey);

    return NextResponse.json(
      {
        ok: true,
        userId,
        source: assignedWallet.source,
        provider: assignedWallet.provider ?? "unknown",
        sourcePublicKey,
        xdr: unsigned.xdr,
        networkPassphrase: unsigned.networkPassphrase,
      },
      { headers: rateLimitHeaders(rate) }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build payment transaction." },
      { status: 500, headers: rateLimitHeaders(rate) }
    );
  }
}
