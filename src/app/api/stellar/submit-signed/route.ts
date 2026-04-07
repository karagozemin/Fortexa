import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { jsonWithRequestContext } from "@/lib/observability/http";
import { getRequestLogContext, logError, logInfo, logWarn } from "@/lib/observability/logger";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { submitSignedTransactionXdr } from "@/lib/stellar/client";
import { stellarSubmitSignedRequestSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  const startedAtMs = Date.now();
  const context = getRequestLogContext(request, "/api/stellar/submit-signed");

  const rate = consumeRateLimit(request, {
    key: "stellar-submit-signed",
    limit: 30,
    windowMs: 60_000,
  });

  if (!rate.ok) {
    logWarn("Submit signed route rate limited", context);
    return jsonWithRequestContext(request, {
      route: "/api/stellar/submit-signed",
      startedAtMs,
      status: 429,
      body: { error: "Rate limit exceeded for signed transaction submission." },
      headers: rateLimitHeaders(rate),
    });
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
      return jsonWithRequestContext(request, {
        route: "/api/stellar/submit-signed",
        startedAtMs,
        status: 400,
        body: {
          error: "Invalid signed transaction submission.",
          details: parsedPayload.error.flatten(),
        },
        headers: rateLimitHeaders(rate),
      });
    }

    const payload = parsedPayload.data;

    const submitted = await submitSignedTransactionXdr(payload.signedXdr);

    logInfo("Signed transaction submitted", {
      ...context,
      userId,
      txHash: submitted.hash,
      ledger: submitted.ledger,
    });

    return jsonWithRequestContext(request, {
      route: "/api/stellar/submit-signed",
      startedAtMs,
      status: 200,
      body: {
        ok: true,
        userId,
        payment: {
          mode: "real",
          ...submitted,
        },
      },
      headers: rateLimitHeaders(rate),
    });
  } catch (error) {
    logError("Submit signed internal error", {
      ...context,
      detail: error instanceof Error ? error.message : "unknown",
    });
    return jsonWithRequestContext(request, {
      route: "/api/stellar/submit-signed",
      startedAtMs,
      status: 500,
      body: { error: error instanceof Error ? error.message : "Failed to submit signed transaction." },
      headers: rateLimitHeaders(rate),
    });
  }
}
