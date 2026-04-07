import { z } from "zod";

const actionKindSchema = z.enum(["api_payment", "tool_access", "transfer", "endpoint_call"]);

const metadataValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const agentActionSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(3).max(200),
  kind: actionKindSchema,
  target: z.string().min(3).max(400),
  domain: z.string().min(3).max(255),
  amountXLM: z.number().positive().max(100000),
  tool: z.string().min(1).max(120).optional(),
  outputPreview: z.string().min(1).max(2000).optional(),
  metadata: z.record(z.string(), metadataValueSchema).optional(),
});

export const decisionRequestSchema = z
  .object({
    scenarioId: z.string().min(1).max(120).optional(),
    action: agentActionSchema.optional(),
    approvedByHuman: z.boolean().optional(),
  })
  .refine((data) => Boolean(data.scenarioId || data.action), {
    message: "Either scenarioId or action is required.",
    path: ["scenarioId"],
  });

export const stellarSetupRequestSchema = z.object({
  publicKey: z.string().startsWith("G", { message: "Stellar public key must start with G." }).min(56).max(56),
  fund: z.boolean().optional(),
  provider: z.string().trim().min(1).max(60).optional(),
});

export const stellarFundRequestSchema = z.object({
  publicKey: z
    .string()
    .startsWith("G", { message: "Stellar public key must start with G." })
    .min(56)
    .max(56)
    .optional(),
});

export const stellarBuildPaymentRequestSchema = z.object({
  destination: z.string().startsWith("G", { message: "Destination must be a Stellar public key." }).min(56).max(56),
  amountXLM: z
    .string()
    .regex(/^\d+(\.\d{1,7})?$/, "amountXLM must be a positive decimal string with up to 7 decimals"),
  memo: z.string().max(28).optional(),
});

export const stellarSubmitSignedRequestSchema = z.object({
  signedXdr: z.string().min(20).max(120000),
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

export type AgentActionInput = z.infer<typeof agentActionSchema>;
export type DecisionRequestInput = z.infer<typeof decisionRequestSchema>;
export type AgentPlanRequestInput = z.infer<typeof agentPlanRequestSchema>;
