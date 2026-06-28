/**
 * policy-import.ts
 * Validates a raw JSON string against policyConfigSchema.
 * Never throws — returns a typed result.
 * Issue: #30
 */

import { policyConfigSchema } from "@/lib/validation/schemas";
import type { PolicyConfig } from "@/lib/types/domain";

export type ImportResult =
  | { ok: true;  policy: PolicyConfig }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function validatePolicyImport(raw: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Invalid JSON — check for missing commas, brackets, or quotes." };
  }

  const result = policyConfigSchema.safeParse(parsed);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "ro
      fieldErrors[path] = [...(fieldErrors[path] ?? []), issue.message];
    }
    return {
      ok: false,
      error: `Schema validation failed — ${result.error.issues.length} error(s) found.`,
      fieldErrors,
    };
  }
  return { ok: true, policy: result.data };
}

export function downloadPolicyJson(policy: PolicyConfig): void {
  const blob = new Blob([JSON.stringify(policy, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = "policy.json";
  link.click();
  URL.revokeObjectURL(url);
}
