import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { AUTH_COOKIE_KEY, createSessionToken } from "@/lib/auth/session";
import { GET, POST } from "@/app/api/policy/route";

function operatorCookie() {
  process.env.FORTEXA_AUTH_SECRET = "integration-test-secret";
  const token = createSessionToken({
    email: "operator@fortexa.local",
    role: "operator",
    userId: "operator-user-id",
    expiresInSeconds: 120,
  });

  return `${AUTH_COOKIE_KEY}=${token}`;
}

function viewerCookie() {
  process.env.FORTEXA_AUTH_SECRET = "integration-test-secret";
  const token = createSessionToken({
    email: "viewer@fortexa.local",
    role: "viewer",
    userId: "viewer-user-id",
    expiresInSeconds: 120,
  });

  return `${AUTH_COOKIE_KEY}=${token}`;
}

describe("/api/policy route", () => {
  it("returns 401 when unauthenticated", async () => {
    const request = new NextRequest("http://localhost/api/policy", { method: "GET" });
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("returns 200 for viewer reading policy (read access allowed)", async () => {
    const request = new NextRequest("http://localhost/api/policy", {
      method: "GET",
      headers: { cookie: viewerCookie() },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);

    const payload = (await response.json()) as { policy: unknown };
    expect(payload.policy).toBeDefined();
  });

  it("returns 403 for viewer attempting policy update (operator-only)", async () => {
    const request = new NextRequest("http://localhost/api/policy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: viewerCookie(),
      },
      body: JSON.stringify({
        allowedDomains: [],
        blockedDomains: [],
        allowedTools: [],
        blockedTools: [],
        perTxCapXLM: 100,
        dailyCapXLM: 500,
        maxToolCallsPerDay: 10,
        riskThreshold: 70,
        allowedHours: { start: 0, end: 23 },
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(403);
  });

  it("allows operator to update and read policy", async () => {
    const cookie = operatorCookie();

    const updateRequest = new NextRequest("http://localhost/api/policy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        allowedDomains: ["api.safe-research.ai"],
        blockedDomains: ["wallet-drainer.evil"],
        allowedTools: ["research-pro"],
        blockedTools: ["shadow-shell"],
        perTxCapXLM: 150,
        dailyCapXLM: 500,
        maxToolCallsPerDay: 12,
        riskThreshold: 80,
        allowedHours: { start: 5, end: 22 },
      }),
    });

    const updateResponse = await POST(updateRequest);
    expect(updateResponse.status).toBe(200);

    const readRequest = new NextRequest("http://localhost/api/policy", {
      method: "GET",
      headers: { cookie },
    });

    const readResponse = await GET(readRequest);
    expect(readResponse.status).toBe(200);

    const payload = (await readResponse.json()) as {
      policy: { perTxCapXLM: number; riskThreshold: number };
    };

    expect(payload.policy.perTxCapXLM).toBe(150);
    expect(payload.policy.riskThreshold).toBe(80);
  });
});
