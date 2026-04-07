import { describe, expect, it } from "vitest";

import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

describe("auth session", () => {
  it("creates and verifies a valid token", () => {
    process.env.FORTEXA_AUTH_SECRET = "unit-test-secret";

    const token = createSessionToken({
      email: "operator@fortexa.local",
      role: "operator",
      userId: "user-123",
      expiresInSeconds: 60,
    });

    const session = verifySessionToken(token);

    expect(session).not.toBeNull();
    expect(session?.email).toBe("operator@fortexa.local");
    expect(session?.role).toBe("operator");
    expect(session?.userId).toBe("user-123");
  });

  it("rejects tampered token", () => {
    process.env.FORTEXA_AUTH_SECRET = "unit-test-secret";

    const token = createSessionToken({
      email: "viewer@fortexa.local",
      role: "viewer",
      userId: "user-xyz",
      expiresInSeconds: 60,
    });

    const [payload] = token.split(".");
    const tampered = `${payload}.invalid-signature`;

    const session = verifySessionToken(tampered);
    expect(session).toBeNull();
  });
});
