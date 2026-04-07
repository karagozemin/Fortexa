import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { stellarBuildPaymentRequestSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  const rate = consumeRateLimit(request, {
    key: "stellar-pay-legacy",
    limit: 20,
    windowMs: 60_000,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded for legacy pay endpoint." },
      { status: 429, headers: rateLimitHeaders(rate) }
    );
  }

  try {
    const auth = requireAuth(request, { allowedRoles: ["operator"] });

    if (!auth.ok) {
      return auth.response;
    }

    const userId = auth.session.userId;

    const rawPayload = (await request.json().catch(() => ({}))) as unknown;
    const parsedPayload = stellarBuildPaymentRequestSchema.safeParse(rawPayload);

    if (!parsedPayload.success) {
      return NextResponse.json(
        {
          error: "Invalid pay request body.",
          details: parsedPayload.error.flatten(),
        },
        { status: 400, headers: rateLimitHeaders(rate) }
      );
    }

    return NextResponse.json(
      {
        error:
          "Direct pay endpoint is disabled. Use wallet-agnostic signed-XDR flow: /api/stellar/build-payment + /api/stellar/submit-signed.",
        userId,
      },
      { status: 400, headers: rateLimitHeaders(rate) }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payment failed." },
      { status: 500, headers: rateLimitHeaders(rate) }
    );
  }
}
