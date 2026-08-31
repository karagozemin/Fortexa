import { z } from "zod";

import {
  isValidPaymentAmountNumber,
  isValidPaymentAmountString,
  PAYMENT_AMOUNT_ERROR,
} from "@/lib/stellar/verify-payment-quote";

export const IDEMPOTENCY_KEY_MIN = 8;
export const IDEMPOTENCY_KEY_MAX = 255;
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;
export const IDEMPOTENCY_KEY_ERROR =
  "Idempotency-Key must be 8–255 characters and contain only letters, numbers, dots, underscores, and hyphens.";

export const idempotencyKeySchema = z
  .string()
  .min(IDEMPOTENCY_KEY_MIN, { message: IDEMPOTENCY_KEY_ERROR })
  .max(IDEMPOTENCY_KEY_MAX, { message: IDEMPOTENCY_KEY_ERROR })
  .regex(IDEMPOTENCY_KEY_PATTERN, { message: IDEMPOTENCY_KEY_ERROR });

export function validateIdempotencyKey(
  key: string | undefined,
): { ok: true; key: string } | { ok: false; error: string } {
  const trimmed = key?.trim() ?? "";
  if (trimmed.length === 0) {
    return { ok: false, error: IDEMPOTENCY_KEY_ERROR };
  }

  const parsed = idempotencyKeySchema.safeParse(trimmed);
  if (!parsed.success) {
    return { ok: false, error: IDEMPOTENCY_KEY_ERROR };
  }

  return { ok: true, key: parsed.data };
}

const actionKindSchema = z.enum([
  "api_payment",
  "tool_access",
  "transfer",
  "endpoint_call",
]);

const metadataValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const agentActionSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(3).max(200),
  kind: actionKindSchema,
  target: z.string().min(3).max(400),
  domain: z.string().min(3).max(255),
  amountXLM: z
    .number({ error: PAYMENT_AMOUNT_ERROR })
    .refine(isValidPaymentAmountNumber, {
      message: PAYMENT_AMOUNT_ERROR,
    }),
  tool: z.string().min(1).max(120).optional(),
  outputPreview: z.string().min(1).max(2000).optional(),
  metadata: z.record(z.string(), metadataValueSchema).optional(),
});

const stellarPublicKeySchema = z
  .string()
  .startsWith("G", { message: "Destination must be a Stellar public key." })
  .min(56)
  .max(56);

const paymentQuoteInputSchema = z.object({
  destination: stellarPublicKeySchema,
  memo: z.string().max(28).optional(),
  network: z.enum(["testnet"]).default("testnet"),
});

export const decisionRequestSchema = z
  .object({
    scenarioId: z.string().min(1).max(120).optional(),
    action: agentActionSchema.optional(),
    approvedByHuman: z.boolean().optional(),
    policyOverrides: z.record(z.string(), z.unknown()).optional(),
    paymentQuote: paymentQuoteInputSchema.optional(),
    paymentQuoteInput: paymentQuoteInputSchema.optional(),
  })
  .refine((data) => Boolean(data.scenarioId || data.action || data.paymentQuote || data.paymentQuoteInput), {
    message: "Either scenarioId, action, or paymentQuote must be provided.",
    path: ["scenarioId"],
  });

export const stellarSetupRequestSchema = z.object({
  provider: z.string().trim().min(1).max(60).optional(),
});

export const stellarBuildPaymentRequestSchema = z.object({
  auditEntryId: z.string().uuid(),
  destination: stellarPublicKeySchema,
  amountXLM: z.string().refine(isValidPaymentAmountString, {
    message: PAYMENT_AMOUNT_ERROR,
  }),
  asset: z.enum(["native"]).default("native"),
  memo: z.string().max(28).optional(),
  network: z.enum(["testnet"]).default("testnet"),
});

export const stellarSubmitSignedRequestSchema = z.object({
  signedXdr: z.string().min(20).max(120000),
  idempotencyKey: idempotencyKeySchema.optional(),
});

export const agentPlanRequestSchema = z.object({
  goal: z.string().min(5).max(2000),
  context: z.string().max(4000).optional(),
  destinationHint: z.string().startsWith("G").min(56).max(56).optional(),
});

export const policyConfigSchema = z.object({
  allowedDomains: z.array(z.string().min(3)).min(1),
  blockedDomains: z.array(z.string().min(3)).min(1),
  allowedTools: z.array(z.string().min(1)).min(1),
  blockedTools: z.array(z.string().min(1)).min(1),
  perTxCapXLM: z.number().positive().max(1_000_000),
  dailyCapXLM: z.number().positive().max(1_000_000),
  maxToolCallsPerDay: z.number().int().positive().max(10_000),
  riskThreshold: z.number().int().min(1).max(100),
  allowedHours: z.object({
    start: z.number().int().min(0).max(23),
    end: z.number().int().min(0).max(23),
  }),
});

/**
 * Body schema for POST /api/policy.
 *
 * Accepts the same `policy` fields as `policyConfigSchema`, plus an optional
 * `expectedVersion` integer for optimistic concurrency control. When supplied,
 * the server compares it to the current stored version and rejects stale saves
 * with 409 Conflict. When omitted, behavior matches the pre-versioning API.
 */
export const policyUpdateSchema = policyConfigSchema.extend({
  expectedVersion: z.number().int().positive().optional(),
});

export const policyRollbackSchema = z.object({
  targetVersion: z.number().int().positive(),
});

export const policyRollbackPreviewSchema = z.object({
  targetVersion: z.number().int().positive(),
  includeAudit: z.boolean().optional(),
  auditSampleSize: z.number().int().min(1).max(10).optional(),
});

export const policySimulateRequestSchema = z.object({
  policy: policyConfigSchema,
  includeAudit: z.boolean().optional(),
  auditSampleSize: z.number().int().min(1).max(10).optional(),
});

export type AgentActionInput = z.infer<typeof agentActionSchema>;
export type DecisionRequestInput = z.infer<typeof decisionRequestSchema>;
export type AgentPlanRequestInput = z.infer<typeof agentPlanRequestSchema>;
export type PolicySimulateRequestInput = z.infer<typeof policySimulateRequestSchema>;
