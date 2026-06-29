import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { AUTH_COOKIE_KEY, createSessionToken } from "@/lib/auth/session";
import { resetMetrics } from "@/lib/observability/metrics";
import { GET } from "@/app/api/metrics/route";

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

describe("/api/metrics route", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("returns 401 when unauthenticated", async () => {
    const request = new NextRequest("http://localhost/api/metrics", { method: "GET" });
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("records the request itself in routes array", async () => {
    const request = new NextRequest("http://localhost/api/metrics", {
      method: "GET",
      headers: { cookie: operatorCookie() },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json() as {
      routes: Array<{ route: string; method: string; totalCount: number }>;
    };

    expect(data.routes).toBeDefined();

    const metricsRoute = data.routes.find((r) => r.route === "/api/metrics");
    expect(metricsRoute).toBeDefined();
    expect(metricsRoute?.method).toBe("GET");
    expect(metricsRoute?.totalCount).toBe(1);
  });

  it("returns Prometheus text format with required metrics", async () => {
    const request = new NextRequest("http://localhost/api/metrics?format=prometheus", {
      method: "GET",
      headers: { cookie: operatorCookie() },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const text = await response.text();

    expect(text).toContain("fortexa_requests_total{");
    expect(text).toContain('route="/api/metrics"');
    expect(text).toContain('method="GET"');
  });
});
