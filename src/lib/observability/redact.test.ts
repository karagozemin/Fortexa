import { describe, expect, it } from "vitest";

import { redactSensitiveFields } from "@/lib/observability/redact";

describe("redactSensitiveFields", () => {
  it("redacts a flat object with sensitive keys", () => {
    const input = { signature: "abc123", token: "xyz", name: "test" };
    const output = redactSensitiveFields(input);
    expect(output).toEqual({ signature: "[REDACTED]", token: "[REDACTED]", name: "test" });
  });

  it("redacts keys case-insensitively", () => {
    const input = { Signature: "abc", SIGNATURE: "def", SiGnAtUrE: "ghi" };
    const output = redactSensitiveFields(input);
    expect(output).toEqual({
      Signature: "[REDACTED]",
      SIGNATURE: "[REDACTED]",
      SiGnAtUrE: "[REDACTED]",
    });
  });

  it("redacts nested object values", () => {
    const input = {
      user: { token: "secret-token", name: "alice" },
      meta: { status: "ok" },
    };
    const output = redactSensitiveFields(input);
    expect(output).toEqual({
      user: { token: "[REDACTED]", name: "alice" },
      meta: { status: "ok" },
    });
  });

  it("redacts values inside arrays", () => {
    const input = {
      logs: [
        { token: "abc", level: "info" },
        { token: "def", level: "warn" },
      ],
    };
    const output = redactSensitiveFields(input);
    expect(output).toEqual({
      logs: [
        { token: "[REDACTED]", level: "info" },
        { token: "[REDACTED]", level: "warn" },
      ],
    });
  });

  it("redacts deeply nested structures", () => {
    const input = {
      level1: {
        level2: {
          level3: { secret: "deep-value", visible: true },
        },
      },
    };
    const output = redactSensitiveFields(input);
    expect(output).toEqual({
      level1: {
        level2: {
          level3: { secret: "[REDACTED]", visible: true },
        },
      },
    });
  });

  it("redacts mixed arrays containing objects and primitives", () => {
    const input = {
      items: [
        { token: "abc" },
        "hello",
        42,
        { secret: "shh", nested: [{ xdr: "signed-stuff" }] },
      ],
    };
    const output = redactSensitiveFields(input);
    expect(output).toEqual({
      items: [
        { token: "[REDACTED]" },
        "hello",
        42,
        { secret: "[REDACTED]", nested: [{ xdr: "[REDACTED]" }] },
      ],
    });
  });

  it("preserves non-sensitive values unchanged", () => {
    const input = {
      requestId: "req-123",
      route: "/api/test",
      method: "POST",
      userId: "user-1",
      statusCode: 200,
    };
    const output = redactSensitiveFields(input);
    expect(output).toEqual(input);
  });

  it("preserves boolean and null values", () => {
    const input = { active: true, deleted: false, data: null };
    const output = redactSensitiveFields(input);
    expect(output).toEqual(input);
  });

  it("redacts authorization header key", () => {
    const input = { authorization: "Bearer secret-token" };
    const output = redactSensitiveFields(input);
    expect(output).toEqual({ authorization: "[REDACTED]" });
  });

  it("redacts cookie and fortexa_session keys", () => {
    const input = { cookie: "session=abc", fortexa_session: "xyz" };
    const output = redactSensitiveFields(input);
    expect(output).toEqual({ cookie: "[REDACTED]", fortexa_session: "[REDACTED]" });
  });

  it("redacts GROQ_API_KEY regardless of casing", () => {
    const input = { GROQ_API_KEY: "sk-123", groq_api_key: "sk-456" };
    const output = redactSensitiveFields(input);
    expect(output).toEqual({ GROQ_API_KEY: "[REDACTED]", groq_api_key: "[REDACTED]" });
  });

  it("handles empty objects and arrays", () => {
    expect(redactSensitiveFields({})).toEqual({});
    expect(redactSensitiveFields([])).toEqual([]);
  });

  it("passes through primitives unchanged", () => {
    expect(redactSensitiveFields("hello")).toBe("hello");
    expect(redactSensitiveFields(42)).toBe(42);
    expect(redactSensitiveFields(true)).toBe(true);
    expect(redactSensitiveFields(null)).toBe(null);
    expect(redactSensitiveFields(undefined)).toBe(undefined);
  });
});
