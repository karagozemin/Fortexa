export const PLAN_ERRORS = {
  MALFORMED_JSON: "PLAN_MALFORMED_JSON",
  SCHEMA_MISMATCH: "PLAN_SCHEMA_MISMATCH",
  EMPTY_RESPONSE: "PLAN_EMPTY_RESPONSE",
  UNSAFE_TOOL: "PLAN_UNSAFE_TOOL",
  UNSAFE_DOMAIN: "PLAN_UNSAFE_DOMAIN",
  PROVIDER_UNAVAILABLE: "PLAN_PROVIDER_UNAVAILABLE",
} as const;

export type PlanErrorCode = (typeof PLAN_ERRORS)[keyof typeof PLAN_ERRORS];

export const PLAN_ERROR_MESSAGES: Record<PlanErrorCode, string> = {
  [PLAN_ERRORS.MALFORMED_JSON]: "Agent plan could not be parsed from model output.",
  [PLAN_ERRORS.SCHEMA_MISMATCH]: "Agent plan did not match the required schema.",
  [PLAN_ERRORS.EMPTY_RESPONSE]: "Model returned an empty response for the agent plan.",
  [PLAN_ERRORS.UNSAFE_TOOL]: "Agent plan references a tool that is not permitted.",
  [PLAN_ERRORS.UNSAFE_DOMAIN]: "Agent plan targets a domain that is not permitted.",
  [PLAN_ERRORS.PROVIDER_UNAVAILABLE]: "The plan generation provider is currently unavailable.",
};

export class PlanError extends Error {
  readonly code: PlanErrorCode;

  constructor(code: PlanErrorCode, detail?: string) {
    super(detail ?? PLAN_ERROR_MESSAGES[code]);
    this.name = "PlanError";
    this.code = code;
  }
}
