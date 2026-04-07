import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { AUTH_COOKIE_KEY, createSessionToken } from "@/lib/auth/session";
import { POST } from "@/app/api/decision/route";

function operatorCookie() {
  process.env.FORTEXA_AUTH_SECRET = "integration-test-secret";
  const token = createSessionToken({
    email: "operator@fortexa.local",
    role: "operator",
    userId: "decision-operator-id",
    expiresInSeconds: 120,
  });

  return `${AUTH_COOKIE_KEY}=${token}`;
}

describe("/api/decision route", () => {
  it("returns 401 when unauthenticated", async () => {
    const request = new NextRequest("http://localhost/api/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenarioId: "safe-research-payment" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("evaluates scenario for operator", async () => {
    const request = new NextRequest("http://localhost/api/decision", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: operatorCookie(),
      },
      body: JSON.stringify({ scenarioId: "safe-research-payment" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      result: { decision: string; riskScore: number };
      userId: string;
    };

    expect(payload.userId).toBe("decision-operator-id");
    expect(typeof payload.result.decision).toBe("string");
    expect(typeof payload.result.riskScore).toBe("number");
  });
});
