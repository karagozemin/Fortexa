import { describe, expect, it } from "vitest";

import {
  agentActionSchema,
  agentPlanRequestSchema,
  IDEMPOTENCY_KEY_ERROR,
  IDEMPOTENCY_KEY_MAX,
  IDEMPOTENCY_KEY_MIN,
  policyConfigSchema,
  stellarBuildPaymentRequestSchema,
  validateIdempotencyKey,
} from "@/lib/validation/schemas";

describe("validation schemas", () => {
  it("accepts valid policy config", () => {
    const parsed = policyConfigSchema.safeParse({
      allowedDomains: ["api.safe-research.ai"],
      blockedDomains: ["wallet-drainer.evil"],
      allowedTools: ["research-pro"],
      blockedTools: ["shadow-shell"],
      perTxCapXLM: 120,
      dailyCapXLM: 300,
      maxToolCallsPerDay: 8,
      riskThreshold: 78,
      allowedHours: { start: 6, end: 23 },
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects invalid destination in stellar build schema", () => {
    const parsed = stellarBuildPaymentRequestSchema.safeParse({
      auditEntryId: "00000000-0000-4000-8000-000000000000",
      destination: "not-a-stellar-key",
      amountXLM: "10.0",
      asset: "native",
      network: "testnet",
    });

    expect(parsed.success).toBe(false);
  });

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    1.00000001,
    99999.99999999999,
  ] as const)(
    "rejects invalid agent action amount: %s",
    (amount) => {
      const parsed = agentActionSchema.safeParse({
        id: "action-1",
        name: "Test payment",
        kind: "api_payment",
        target: "svc:endpoint",
        domain: "api.example.com",
        amountXLM: amount,
      });

      expect(parsed.success).toBe(false);
    },
  );

  it("accepts valid agent action amount boundaries", () => {
    for (const amountXLM of [0.0000001, 100000]) {
      const parsed = agentActionSchema.safeParse({
        id: "action-boundary",
        name: "Boundary payment",
        kind: "api_payment",
        target: "svc:endpoint",
        domain: "api.example.com",
        amountXLM,
      });

      expect(parsed.success).toBe(true);
    }
  });

  it.each(["0", "-1", "0.00000001", "10.12345678", "10foo"])(
    "rejects invalid payment build amount: %s",
    (amount) => {
      const parsed = stellarBuildPaymentRequestSchema.safeParse({
        auditEntryId: "00000000-0000-4000-8000-000000000000",
        destination: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        amountXLM: amount,
        asset: "native",
        network: "testnet",
      });

      expect(parsed.success).toBe(false);
    },
  );

  it("accepts valid payment amount boundaries", () => {
    for (const amount of ["0.0000001", "100000.0000000"]) {
      const parsed = stellarBuildPaymentRequestSchema.safeParse({
        auditEntryId: "00000000-0000-4000-8000-000000000000",
        destination: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        amountXLM: amount,
        asset: "native",
        network: "testnet",
      });

      expect(parsed.success).toBe(true);
    }
  });

  it("accepts valid agent plan request", () => {
    const parsed = agentPlanRequestSchema.safeParse({
      goal: "Find a safe data provider and plan payment.",
      context: "Need low-risk endpoint.",
    });

    expect(parsed.success).toBe(true);
  });
  describe("validateIdempotencyKey", () => {
    it("rejects empty keys", () => {
      expect(validateIdempotencyKey("")).toEqual({ ok: false, error: IDEMPOTENCY_KEY_ERROR });
      expect(validateIdempotencyKey("   ")).toEqual({ ok: false, error: IDEMPOTENCY_KEY_ERROR });
      expect(validateIdempotencyKey(undefined)).toEqual({ ok: false, error: IDEMPOTENCY_KEY_ERROR });
    });

    it("rejects keys shorter than minimum length", () => {
      expect(validateIdempotencyKey("a".repeat(IDEMPOTENCY_KEY_MIN - 1))).toEqual({
        ok: false,
        error: IDEMPOTENCY_KEY_ERROR,
      });
    });

    it("rejects keys longer than maximum length", () => {
      expect(validateIdempotencyKey("a".repeat(IDEMPOTENCY_KEY_MAX + 1))).toEqual({
        ok: false,
        error: IDEMPOTENCY_KEY_ERROR,
      });
    });

    it("rejects keys with invalid characters", () => {
      for (const key of ["1234567!", "1234 5678", "12345678/", "12345678@"]) {
        expect(validateIdempotencyKey(key)).toEqual({
          ok: false,
          error: IDEMPOTENCY_KEY_ERROR,
        });
      }
    });

    it("accepts valid boundary keys", () => {
      const minKey = "a".repeat(IDEMPOTENCY_KEY_MIN);
      const maxKey = "A".repeat(IDEMPOTENCY_KEY_MAX);
      expect(validateIdempotencyKey(minKey)).toEqual({ ok: true, key: minKey });
      expect(validateIdempotencyKey(maxKey)).toEqual({ ok: true, key: maxKey });
      expect(validateIdempotencyKey("idem-key_01.test")).toEqual({
        ok: true,
        key: "idem-key_01.test",
      });
    });
  });

});
