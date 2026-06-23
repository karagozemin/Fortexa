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

function viewerCookie() {
  process.env.FORTEXA_AUTH_SECRET = "integration-test-secret";
  const token = createSessionToken({
    email: "viewer@fortexa.local",
    role: "viewer",
    userId: "viewer-audit-export",
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

  it("exports filtered mine scope as json", async () => {
    const request = new NextRequest(
      "http://localhost/api/audit/export?format=json&scope=mine&from=2025-01-01T00:00:00Z&to=2030-01-01T00:00:00Z&decision=APPROVE&domain=stellar.org&actionId=test-123",
      {
        method: "GET",
        headers: {
          cookie: operatorCookie(),
        },
      }
    );

    const response = await GET(request);

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      scope: string;
      userId: string;
      entries: unknown[];
    };

    expect(payload.scope).toBe("mine");
    expect(Array.isArray(payload.entries)).toBe(true);
  });

  it("exports filtered all scope as csv for operator", async () => {
    const request = new NextRequest(
      "http://localhost/api/audit/export?format=csv&scope=all&from=2025-01-01T00:00:00Z&to=2030-01-01T00:00:00Z",
      {
        method: "GET",
        headers: {
          cookie: operatorCookie(),
        },
      }
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
  });

  it("returns 400 for invalid from date", async () => {
    const request = new NextRequest(
      "http://localhost/api/audit/export?format=json&scope=mine&from=not-a-date",
      {
        method: "GET",
        headers: {
          cookie: operatorCookie(),
        },
      }
    );

    const response = await GET(request);

    expect(response.status).toBe(400);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("from");
  });

  it("returns 400 for invalid decision", async () => {
    const request = new NextRequest(
      "http://localhost/api/audit/export?format=json&scope=mine&decision=INVALID_DECISION",
      {
        method: "GET",
        headers: {
          cookie: operatorCookie(),
        },
      }
    );

    const response = await GET(request);

    expect(response.status).toBe(400);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("decision");
  });

  it("returns 400 when viewer tries scope=all", async () => {
    const request = new NextRequest(
      "http://localhost/api/audit/export?format=json&scope=all",
      {
        method: "GET",
        headers: {
          cookie: viewerCookie(),
        },
      }
    );

    const response = await GET(request);

    expect(response.status).toBe(400);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("Viewer");
  });

  it("allows viewer to use scope=mine", async () => {
    const request = new NextRequest(
      "http://localhost/api/audit/export?format=json&scope=mine",
      {
        method: "GET",
        headers: {
          cookie: viewerCookie(),
        },
      }
    );

    const response = await GET(request);

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      scope: string;
      userId: string;
      entries: unknown[];
    };

    expect(payload.scope).toBe("mine");
    expect(payload.userId).toBe("viewer-audit-export");
    expect(Array.isArray(payload.entries)).toBe(true);
  });
});
