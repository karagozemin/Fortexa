import { afterEach, describe, expect, it } from "vitest";

import {
  buildPaymentQuoteFromDecision,
  normalizeAmountXLM,
  verifyPaymentAgainstQuote,
} from "@/lib/stellar/verify-payment-quote";
import type { AuditEntry } from "@/lib/types/domain";

function mockAuditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "audit-1",
    timestamp: new Date().toISOString(),
    action: {
      id: "act-1",
      name: "Test payment",
      kind: "api_payment",
      target: "svc:endpoint",
      domain: "api.example.com",
      amountXLM: 10,
    },
    decision: "APPROVE",
    explanation: "Approved",
    triggeredPolicies: [],
    riskFindings: [],
    paymentQuote: buildPaymentQuoteFromDecision({
      destination: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      amountXLM: 10,
      actionId: "act-1",
    }),
    ...overrides,
  };
}

describe("verifyPaymentAgainstQuote", () => {
  afterEach(() => {
    delete process.env.FORTEXA_PAYMENT_QUOTE_TTL_SECONDS;
  });

  it("accepts a matching build request", () => {
    const entry = mockAuditEntry();
    const result = verifyPaymentAgainstQuote(entry, {
      destination: entry.paymentQuote!.destination,
      amountXLM: entry.paymentQuote!.amountXLM,
      asset: "native",
      memo: entry.paymentQuote!.memo,
      network: "testnet",
    });

    expect(result.ok).toBe(true);
  });

  it("rejects blocked decisions", () => {
    const entry = mockAuditEntry({ decision: "BLOCK", paymentQuote: undefined });
    const result = verifyPaymentAgainstQuote(entry, {
      destination: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      amountXLM: "10.0000000",
      asset: "native",
      memo: "fortexa:act-1",
      network: "testnet",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toContain("BLOCK");
    }
  });

  it("rejects an expired quote", () => {
    process.env.FORTEXA_PAYMENT_QUOTE_TTL_SECONDS = "300";
    // Timestamp 6 minutes in the past — beyond the 300 s TTL
    const staleTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const entry = mockAuditEntry({ timestamp: staleTimestamp });

    const result = verifyPaymentAgainstQuote(entry, {
      destination: entry.paymentQuote!.destination,
      amountXLM: entry.paymentQuote!.amountXLM,
      asset: "native",
      memo: entry.paymentQuote!.memo,
      network: "testnet",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toContain("expired");
    }
  });

  it("accepts a fresh quote when TTL is configured", () => {
    process.env.FORTEXA_PAYMENT_QUOTE_TTL_SECONDS = "300";
    // Timestamp 30 seconds in the past — well within the 300 s TTL
    const recentTimestamp = new Date(Date.now() - 30 * 1000).toISOString();
    const entry = mockAuditEntry({ timestamp: recentTimestamp });

    const result = verifyPaymentAgainstQuote(entry, {
      destination: entry.paymentQuote!.destination,
      amountXLM: entry.paymentQuote!.amountXLM,
      asset: "native",
      memo: entry.paymentQuote!.memo,
      network: "testnet",
    });

    expect(result.ok).toBe(true);
  });

  it("falls back to the 300 s default when TTL env var is invalid", () => {
    process.env.FORTEXA_PAYMENT_QUOTE_TTL_SECONDS = "not-a-number";
    // Timestamp 6 minutes in the past — expired under the 300 s default
    const staleTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const entry = mockAuditEntry({ timestamp: staleTimestamp });

    const result = verifyPaymentAgainstQuote(entry, {
      destination: entry.paymentQuote!.destination,
      amountXLM: entry.paymentQuote!.amountXLM,
      asset: "native",
      memo: entry.paymentQuote!.memo,
      network: "testnet",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toContain("expired");
    }
  });

  it("falls back to the 300 s default when TTL env var is zero", () => {
    process.env.FORTEXA_PAYMENT_QUOTE_TTL_SECONDS = "0";
    // Timestamp 6 minutes in the past — expired under the 300 s default
    const staleTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const entry = mockAuditEntry({ timestamp: staleTimestamp });

    const result = verifyPaymentAgainstQuote(entry, {
      destination: entry.paymentQuote!.destination,
      amountXLM: entry.paymentQuote!.amountXLM,
      asset: "native",
      memo: entry.paymentQuote!.memo,
      network: "testnet",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toContain("expired");
    }
  });
});


describe("normalizeAmountXLM", () => {
  it("formats numeric and string amounts consistently", () => {
    expect(normalizeAmountXLM(18)).toBe("18.0000000");
    expect(normalizeAmountXLM("18")).toBe("18.0000000");
    expect(normalizeAmountXLM("18.5")).toBe("18.5000000");
  });
});

describe("buildPaymentQuoteFromDecision", () => {
  it("derives memo from action id when omitted", () => {
    const quote = buildPaymentQuoteFromDecision({
      destination: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      amountXLM: 12,
      actionId: "act-99",
    });

    expect(quote.memo).toBe("fortexa:act-99");
    expect(quote.amountXLM).toBe("12.0000000");
    expect(quote.asset).toBe("native");
    expect(quote.network).toBe("testnet");
  });
});
