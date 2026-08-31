import {
  parseXlmNumberToStroops,
  parseXlmToStroops,
  stroopsToXlmString,
  STROOPS_PER_XLM,
} from "@/lib/stellar/stroops";
import type {
  AuditEntry,
  PaymentQuote,
  StellarAssetId,
  StellarNetworkId,
} from "@/lib/types/domain";

export type PaymentQuoteField =
  | "destination"
  | "amountXLM"
  | "asset"
  | "memo"
  | "network";

export type PaymentBuildParams = {
  destination: string;
  amountXLM: string;
  asset: StellarAssetId;
  memo?: string;
  network: StellarNetworkId;
};

export type VerifyPaymentQuoteResult =
  | { ok: true; quote: PaymentQuote }
  | {
      ok: false;
      status: 400 | 403;
      error: string;
      field?: PaymentQuoteField;
    };

const EXECUTABLE_DECISIONS = new Set(["APPROVE", "WARN"]);

export const MAX_PAYMENT_AMOUNT_XLM = 100_000;
const PAYMENT_AMOUNT_DECIMAL_PLACES = 7;
export const PAYMENT_AMOUNT_ERROR =
  "amountXLM must be a positive finite XLM amount with up to 7 decimals.";

const MAX_PAYMENT_AMOUNT_STROOPS = BigInt(MAX_PAYMENT_AMOUNT_XLM) * STROOPS_PER_XLM;

/**
 * Reads an authorized amount as an exact stroop count, or `null` if it is not
 * one. Amounts are never scaled in floating point: a value finer than a stroop
 * is refused rather than rounded, because rounding would change the amount the
 * user actually authorized.
 */
function toAuthorizedStroops(amount: number | string): bigint | null {
  const parsed =
    typeof amount === "number" ? parseXlmNumberToStroops(amount) : parseXlmToStroops(amount);

  if (!parsed.ok) {
    return null;
  }

  if (parsed.stroops <= 0n || parsed.stroops > MAX_PAYMENT_AMOUNT_STROOPS) {
    return null;
  }

  return parsed.stroops;
}

export function isValidPaymentAmountNumber(amount: number): boolean {
  return toAuthorizedStroops(amount) !== null;
}

export function isValidPaymentAmountString(amount: string): boolean {
  // The wire format stays deliberately narrow: unsigned, no exponent notation,
  // and at most 7 written decimals. The value itself is then read exactly.
  if (!/^\d+(?:\.\d+)?$/.test(amount)) {
    return false;
  }

  const [, fraction = ""] = amount.split(".");
  if (fraction.length > PAYMENT_AMOUNT_DECIMAL_PLACES) {
    return false;
  }

  return toAuthorizedStroops(amount) !== null;
}

/** Default quote TTL: 300 seconds (5 minutes). */
const DEFAULT_QUOTE_TTL_SECONDS = 300;

/**
 * Returns the payment quote TTL in milliseconds.
 * Reads FORTEXA_PAYMENT_QUOTE_TTL_SECONDS; falls back to 300 s when the
 * value is absent, non-numeric, or less than 1.
 */
function getQuoteTtlMs(): number {
  const parsed = Number(
    process.env.FORTEXA_PAYMENT_QUOTE_TTL_SECONDS ?? DEFAULT_QUOTE_TTL_SECONDS,
  );
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_QUOTE_TTL_SECONDS * 1000;
  }
  return Math.floor(parsed) * 1000;
}

export function normalizeAmountXLM(amount: number | string): string {
  const valid =
    typeof amount === "number"
      ? isValidPaymentAmountNumber(amount)
      : isValidPaymentAmountString(amount);

  if (!valid) {
    throw new Error(PAYMENT_AMOUNT_ERROR);
  }

  const stroops = toAuthorizedStroops(amount);
  if (stroops === null) {
    throw new Error(PAYMENT_AMOUNT_ERROR);
  }

  // Render from the exact stroop count rather than from a double, so the
  // normalized string is the amount that was authorized, to the stroop.
  return stroopsToXlmString(stroops);
}

export function buildPaymentQuoteFromDecision(input: {
  destination: string;
  amountXLM: number;
  memo?: string;
  actionId: string;
  network?: StellarNetworkId;
}): PaymentQuote {
  return {
    destination: input.destination.trim().toUpperCase(),
    amountXLM: normalizeAmountXLM(input.amountXLM),
    asset: "native",
    memo: (input.memo ?? `fortexa:${input.actionId}`).slice(0, 28),
    network: input.network ?? "testnet",
  };
}

export function verifyPaymentAgainstQuote(
  auditEntry: AuditEntry | undefined,
  request: PaymentBuildParams,
): VerifyPaymentQuoteResult {
  if (!auditEntry) {
    return {
      ok: false,
      status: 403,
      error: "No authorized payment decision found for this request.",
    };
  }

  if (!EXECUTABLE_DECISIONS.has(auditEntry.decision)) {
    return {
      ok: false,
      status: 403,
      error: `Decision '${auditEntry.decision}' does not authorize payment execution.`,
    };
  }

  if (Date.now() - Date.parse(auditEntry.timestamp) > getQuoteTtlMs()) {
    return {
      ok: false,
      status: 403,
      error: "Payment quote has expired. Please re-evaluate the action.",
    };
  }

  const quote = auditEntry.paymentQuote;
  if (!quote) {
    return {
      ok: false,
      status: 403,
      error: "Decision is missing an authorized payment quote.",
    };
  }

  let normalizedRequest: Omit<PaymentBuildParams, "amountXLM"> & {
    amountXLM: string;
  };
  try {
    normalizedRequest = {
      destination: request.destination.trim().toUpperCase(),
      amountXLM: normalizeAmountXLM(request.amountXLM),
      asset: request.asset,
      memo: (request.memo ?? quote.memo).slice(0, 28),
      network: request.network,
    };
  } catch {
    return {
      ok: false,
      status: 400,
      error: PAYMENT_AMOUNT_ERROR,
      field: "amountXLM",
    };
  }

  if (normalizedRequest.destination !== quote.destination) {
    return {
      ok: false,
      status: 403,
      error: "Destination does not match the authorized payment quote.",
      field: "destination",
    };
  }

  if (normalizedRequest.amountXLM !== quote.amountXLM) {
    return {
      ok: false,
      status: 403,
      error: "Amount does not match the authorized payment quote.",
      field: "amountXLM",
    };
  }

  if (normalizedRequest.asset !== quote.asset) {
    return {
      ok: false,
      status: 403,
      error: "Asset does not match the authorized payment quote.",
      field: "asset",
    };
  }

  if (normalizedRequest.memo !== quote.memo) {
    return {
      ok: false,
      status: 403,
      error: "Memo does not match the authorized payment quote.",
      field: "memo",
    };
  }

  if (normalizedRequest.network !== quote.network) {
    return {
      ok: false,
      status: 403,
      error: "Network does not match the authorized payment quote.",
      field: "network",
    };
  }

  return { ok: true, quote };
}
