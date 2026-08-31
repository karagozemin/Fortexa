import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  logValidationFailure,
  SENSITIVE_FIELD_KEYS,
  toPublicValidationDetails,
} from "@/lib/validation/errors";

vi.mock("@/lib/observability/logger", () => ({
  logWarn: vi.fn(),
}));

import { logWarn } from "@/lib/observability/logger";

describe("toPublicValidationDetails", () => {
  it("redacts sensitive field values from public validation details", () => {
    const schema = z.object({
      signedXdr: z.string().min(100),
      signature: z.string().min(10),
      goal: z.string().min(5),
    });

    const secretXdr = "SHORT_SECRET_SIGNED_XDR_VALUE";
    const secretSignature = "short";
    const parsed = schema.safeParse({
      signedXdr: secretXdr,
      signature: secretSignature,
      goal: "hi",
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }

    const details = toPublicValidationDetails(parsed.error);
    const serialized = JSON.stringify(details);

    expect(serialized).not.toContain(secretXdr);
    expect(serialized).not.toContain(secretSignature);
    expect(details.fieldErrors.signedXdr).toEqual(["Invalid value."]);
    expect(details.fieldErrors.signature).toEqual(["Invalid value."]);
    expect(details.fieldErrors.goal?.length).toBeGreaterThan(0);
  });

  it("covers known sensitive field keys", () => {
    expect(SENSITIVE_FIELD_KEYS.has("signedxdr")).toBe(true);
    expect(SENSITIVE_FIELD_KEYS.has("token")).toBe(true);
    expect(SENSITIVE_FIELD_KEYS.has("password")).toBe(true);
  });
});

describe("logValidationFailure", () => {
  it("logs redacted validation context server-side", () => {
    vi.mocked(logWarn).mockClear();

    const schema = z.object({ signedXdr: z.string().min(20) });
    const secretXdr = "TOO_SHORT_XDR_LEAK";
    const parsed = schema.safeParse({ signedXdr: secretXdr });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }

    logValidationFailure("validation failed", { route: "/test" }, parsed.error, {
      signedXdr: secretXdr,
    });

    expect(logWarn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(vi.mocked(logWarn).mock.calls[0]?.[1]);
    expect(logged).not.toContain(secretXdr);
    expect(logged).toContain("[REDACTED]");
  });
});
