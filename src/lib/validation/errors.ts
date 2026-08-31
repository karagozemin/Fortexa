import type { ZodError } from "zod";

import { logWarn, type LogContext } from "@/lib/observability/logger";
import { redactSensitiveFields } from "@/lib/observability/redact";

export const SENSITIVE_FIELD_KEYS = new Set([
  "api_key",
  "apikey",
  "authorization",
  "cookie",
  "fortexa_session",
  "groq_api_key",
  "password",
  "secret",
  "signature",
  "signed_xdr",
  "signedxdr",
  "token",
  "xdr",
]);

const PUBLIC_SENSITIVE_FIELD_MESSAGE = "Invalid value.";

function fieldPathHasSensitiveKey(fieldPath: string): boolean {
  return fieldPath.split(".").some((segment) => SENSITIVE_FIELD_KEYS.has(segment.toLowerCase()));
}

export type PublicValidationDetails = {
  formErrors: string[];
  fieldErrors: Record<string, string[]>;
};

export function toPublicValidationDetails(error: ZodError): PublicValidationDetails {
  const flattened = error.flatten();
  const fieldErrors: Record<string, string[]> = {};

  for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
    if (fieldPathHasSensitiveKey(field)) {
      fieldErrors[field] = [PUBLIC_SENSITIVE_FIELD_MESSAGE];
    } else {
      fieldErrors[field] = messages ?? [];
    }
  }

  return {
    formErrors: flattened.formErrors,
    fieldErrors,
  };
}

export function logValidationFailure(
  message: string,
  context: LogContext,
  error: ZodError,
  rawBody?: unknown,
): void {
  logWarn(
    message,
    redactSensitiveFields({
      ...context,
      validation: error.flatten(),
      body: rawBody,
    }) as LogContext,
  );
}
