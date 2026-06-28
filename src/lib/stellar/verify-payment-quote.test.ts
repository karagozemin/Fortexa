import { describe, expect, it } from "vitest";

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
