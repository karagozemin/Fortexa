import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { getRequestLogContext, logError, logInfo, logWarn } from "@/lib/observability/logger";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { submitSignedTransactionXdr } from "@/lib/stellar/client";
import { stellarSubmitSignedRequestSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  const context = getRequestLogContext(request, "/api/stellar/submit-signed");

  const rate = consumeRateLimit(request, {
    key: "stellar-submit-signed",
    limit: 30,
    windowMs: 60_000,
  });

  if (!rate.ok) {
    logWarn("Submit signed route rate limited", context);
    return NextResponse.json(
      { error: "Rate limit exceeded for signed transaction submission." },
      { status: 429, headers: rateLimitHeaders(rate) }
    );
  }

  try {
    const auth = requireAuth(request, { allowedRoles: ["operator"] });

    if (!auth.ok) {
      logWarn("Submit signed route unauthorized", context);
      return auth.response;
    }

    const userId = auth.session.userId;

    const rawPayload = (await request.json().catch(() => ({}))) as unknown;
    const parsedPayload = stellarSubmitSignedRequestSchema.safeParse(rawPayload);

    if (!parsedPayload.success) {
      logWarn("Submit signed validation failed", { ...context, userId });
      return NextResponse.json(
        {
          error: "Invalid signed transaction submission.",
          details: parsedPayload.error.flatten(),
        },
        { status: 400, headers: rateLimitHeaders(rate) }
      );
    }

    const payload = parsedPayload.data;

    const submitted = await submitSignedTransactionXdr(payload.signedXdr);

    logInfo("Signed transaction submitted", {
      ...context,
      userId,
      txHash: submitted.hash,
      ledger: submitted.ledger,
    });

    return NextResponse.json(
      {
        ok: true,
        userId,
        payment: {
          mode: "real",
          ...submitted,
        },
      },
      { headers: rateLimitHeaders(rate) }
    );
  } catch (error) {
    logError("Submit signed internal error", {
      ...context,
      detail: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit signed transaction." },
      { status: 500, headers: rateLimitHeaders(rate) }
    );
  }
}
