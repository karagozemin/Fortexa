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

export function normalizeAmountXLM(amount: number | string): string {
  const parsed = typeof amount === "number" ? amount : Number.parseFloat(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Invalid XLM amount.");
  }
  return parsed.toFixed(7);
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

  const quote = auditEntry.paymentQuote;
  if (!quote) {
    return {
      ok: false,
      status: 403,
      error: "Decision is missing an authorized payment quote.",
    };
  }

  const normalizedRequest = {
    destination: request.destination.trim().toUpperCase(),
    amountXLM: normalizeAmountXLM(request.amountXLM),
    asset: request.asset,
    memo: (request.memo ?? quote.memo).slice(0, 28),
    network: request.network,
  };

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
