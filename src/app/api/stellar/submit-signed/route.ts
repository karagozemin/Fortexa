import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { jsonWithRequestContext } from "@/lib/observability/http";
import { getRequestLogContext, logError, logInfo, logWarn } from "@/lib/observability/logger";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { getStellarExplorerTransactionUrl } from "@/lib/stellar/network";
import { submitSignedTransactionXdr } from "@/lib/stellar/client";
import {
  getIdempotencyRecord,
  hashSignedXdr,
  putIdempotencyRecord,
} from "@/lib/storage/submit-idempotency-store";
import { stellarSubmitSignedRequestSchema } from "@/lib/validation/schemas";

type HorizonErrorContext = {
  explanation: string;
  nextStep: string;
};

const HORIZON_TX_ERRORS: Record<string, HorizonErrorContext> = {
  tx_bad_seq: {
    explanation: "The transaction sequence number is incorrect.",
    nextStep: "Refresh your wallet or account data to synchronize the sequence number and try again.",
  },
  tx_insufficient_fee: {
    explanation: "The network fee provided is too low.",
    nextStep: "Increase the transaction fee.",
  },
  tx_failed: {
    explanation: "The transaction failed during operation execution.",
    nextStep: "Check the operation error codes for more details.",
  },
};

const HORIZON_OP_ERRORS: Record<string, HorizonErrorContext> = {
  op_no_destination: {
    explanation: "The destination account does not exist on the network.",
    nextStep: "Verify the destination address or ensure the account is funded.",
  },
  op_underfunded: {
    explanation: "The source account lacks sufficient funds for this operation.",
    nextStep: "Fund the source account with enough XLM to cover the payment and reserves.",
  },
};

export function formatSubmitError(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: "Failed to submit signed transaction." };
  }

  const withResponse = error as Error & {
    response?: {
      data?: {
        extras?: {
          result_codes?: {
            transaction?: string;
            operations?: string[];
          };
        };
      };
    };
  };

  const txCode = withResponse.response?.data?.extras?.result_codes?.transaction;
  const opCodes = withResponse.response?.data?.extras?.result_codes?.operations;

  if (!txCode) {
    return { message: error.message };
  }

  let explanation: string | undefined;
  let nextStep: string | undefined;

  if (opCodes && opCodes.length > 0) {
    const firstOpError = opCodes.find((code) => HORIZON_OP_ERRORS[code]);
    if (firstOpError) {
      explanation = HORIZON_OP_ERRORS[firstOpError].explanation;
      nextStep = HORIZON_OP_ERRORS[firstOpError].nextStep;
    } else if (HORIZON_TX_ERRORS[txCode]) {
      explanation = HORIZON_TX_ERRORS[txCode].explanation;
      nextStep = HORIZON_TX_ERRORS[txCode].nextStep;
    }
  } else if (HORIZON_TX_ERRORS[txCode]) {
    explanation = HORIZON_TX_ERRORS[txCode].explanation;
    nextStep = HORIZON_TX_ERRORS[txCode].nextStep;
  }

  return {
    message: `${error.message} (tx: ${txCode}${opCodes?.length ? `, ops: ${opCodes.join(",")}` : ""})`,
    txCode,
    opCodes,
    explanation,
    nextStep,
  };
}

export async function POST(request: NextRequest) {
  const startedAtMs = Date.now();
  const context = getRequestLogContext(request, "/api/stellar/submit-signed");

  const rate = await consumeRateLimit(request, {
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

    const headerKey = request.headers.get("idempotency-key")?.trim();
    const bodyKey = payload.idempotencyKey?.trim();
    const idempotencyKey = headerKey && headerKey.length > 0 ? headerKey : bodyKey;

    if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 255)) {
      logWarn("Submit signed invalid idempotency key", { ...context, userId });
      return jsonWithRequestContext(request, {
        route: "/api/stellar/submit-signed",
        startedAtMs,
        status: 400,
        body: { error: "Idempotency-Key must be between 8 and 255 characters." },
        headers: rateLimitHeaders(rate),
      });
    }

    const xdrHash = idempotencyKey ? hashSignedXdr(payload.signedXdr) : null;

    if (idempotencyKey && xdrHash) {
      const existing = await getIdempotencyRecord(userId, idempotencyKey);

      if (existing && existing.xdrHash === xdrHash) {
        logInfo("Signed transaction idempotent replay", { ...context, userId, idempotencyKey });
        return jsonWithRequestContext(request, {
          route: "/api/stellar/submit-signed",
          startedAtMs,
          status: 200,
          body: existing.result,
          headers: { ...rateLimitHeaders(rate), "Idempotency-Replayed": "true" },
        });
      }

      if (existing) {
        logWarn("Signed transaction idempotency conflict", { ...context, userId, idempotencyKey });
        return jsonWithRequestContext(request, {
          route: "/api/stellar/submit-signed",
          startedAtMs,
          status: 409,
          body: {
            error: "Idempotency-Key was already used with a different signed transaction.",
          },
          headers: { ...rateLimitHeaders(rate), "Idempotency-Replayed": "false" },
        });
      }
    }

    const submitted = await submitSignedTransactionXdr(payload.signedXdr);

    logInfo("Signed transaction submitted", {
      ...context,
      userId,
      txHash: submitted.hash,
      ledger: submitted.ledger,
    });

    const responseBody = {
      ok: true,
      userId,
      payment: {
        mode: "real",
        ...submitted,
      },
      explorerUrl: getStellarExplorerTransactionUrl(submitted.hash),
    };

    if (idempotencyKey && xdrHash) {
      await putIdempotencyRecord(userId, idempotencyKey, { xdrHash, result: responseBody });
    }

    return jsonWithRequestContext(request, {
      route: "/api/stellar/submit-signed",
      startedAtMs,
      status: 200,
      body: responseBody,
      headers: idempotencyKey
        ? { ...rateLimitHeaders(rate), "Idempotency-Replayed": "false" }
        : rateLimitHeaders(rate),
    });
  } catch (error) {
    const formatted = formatSubmitError(error);
    logError("Submit signed internal error", {
      ...context,
      detail: formatted.message,
    });
    return jsonWithRequestContext(request, {
      route: "/api/stellar/submit-signed",
      startedAtMs,
      status: 500,
      body: {
        error: formatted.message,
        resultCode: formatted.txCode,
        operationCodes: formatted.opCodes,
        explanation: formatted.explanation,
        nextStep: formatted.nextStep,
      },
      headers: rateLimitHeaders(rate),
    });
  }
}
