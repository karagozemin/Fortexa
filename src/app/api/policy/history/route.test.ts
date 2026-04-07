import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { AUTH_COOKIE_KEY, createSessionToken } from "@/lib/auth/session";
import { GET } from "@/app/api/policy/history/route";

function operatorCookie() {
  process.env.FORTEXA_AUTH_SECRET = "integration-test-secret";
  const token = createSessionToken({
    email: "operator@fortexa.local",
    role: "operator",
    userId: "policy-history-operator",
    expiresInSeconds: 120,
  });

  return `${AUTH_COOKIE_KEY}=${token}`;
}

describe("/api/policy/history route", () => {
  it("returns 401 when unauthenticated", async () => {
    const request = new NextRequest("http://localhost/api/policy/history", { method: "GET" });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it("returns history for operator", async () => {
    const request = new NextRequest("http://localhost/api/policy/history?limit=3", {
      method: "GET",
      headers: { cookie: operatorCookie() },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const payload = (await response.json()) as { entries: Array<{ version: number }> };
    expect(Array.isArray(payload.entries)).toBe(true);
  });
});
