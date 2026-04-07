import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { AUTH_COOKIE_KEY, createSessionToken } from "@/lib/auth/session";
import { POST } from "@/app/api/policy/rollback/route";

function operatorCookie() {
  process.env.FORTEXA_AUTH_SECRET = "integration-test-secret";
  const token = createSessionToken({
    email: "operator@fortexa.local",
    role: "operator",
    userId: "policy-rollback-operator",
    expiresInSeconds: 120,
  });

  return `${AUTH_COOKIE_KEY}=${token}`;
}

describe("/api/policy/rollback route", () => {
  it("returns 401 when unauthenticated", async () => {
    const request = new NextRequest("http://localhost/api/policy/rollback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetVersion: 1 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("allows operator rollback to version 1", async () => {
    const request = new NextRequest("http://localhost/api/policy/rollback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: operatorCookie(),
      },
      body: JSON.stringify({ targetVersion: 1 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
