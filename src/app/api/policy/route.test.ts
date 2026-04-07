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

describe("/api/policy route", () => {
  it("returns 401 when unauthenticated", async () => {
    const request = new NextRequest("http://localhost/api/policy", { method: "GET" });
    const response = await GET(request);

    expect(response.status).toBe(401);
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
