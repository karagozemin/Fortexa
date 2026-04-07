import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { AUTH_COOKIE_KEY, createSessionToken } from "@/lib/auth/session";
import { GET } from "@/app/api/audit/export/route";

function operatorCookie() {
  process.env.FORTEXA_AUTH_SECRET = "integration-test-secret";
  const token = createSessionToken({
    email: "operator@fortexa.local",
    role: "operator",
    userId: "operator-audit-export",
    expiresInSeconds: 120,
  });

  return `${AUTH_COOKIE_KEY}=${token}`;
}

describe("/api/audit/export route", () => {
  it("returns 401 when unauthenticated", async () => {
    const request = new NextRequest("http://localhost/api/audit/export", { method: "GET" });
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("exports mine scope as json for authenticated user", async () => {
    const request = new NextRequest("http://localhost/api/audit/export?format=json&scope=mine", {
      method: "GET",
      headers: {
        cookie: operatorCookie(),
      },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      scope: string;
      userId: string;
      entries: unknown[];
    };

    expect(payload.scope).toBe("mine");
    expect(payload.userId).toBe("operator-audit-export");
    expect(Array.isArray(payload.entries)).toBe(true);
  });
});
