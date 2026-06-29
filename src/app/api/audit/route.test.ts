import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { AUTH_COOKIE_KEY, createSessionToken } from "@/lib/auth/session";
import { GET } from "@/app/api/audit/route";

function operatorCookie() {
  process.env.FORTEXA_AUTH_SECRET = "integration-test-secret";
  const token = createSessionToken({
    email: "operator@fortexa.local",
    role: "operator",
    userId: "audit-operator-id",
    expiresInSeconds: 120,
  });

  return `${AUTH_COOKIE_KEY}=${token}`;
}

function viewerCookie() {
  process.env.FORTEXA_AUTH_SECRET = "integration-test-secret";
  const token = createSessionToken({
    email: "viewer@fortexa.local",
    role: "viewer",
    userId: "audit-viewer-id",
    expiresInSeconds: 120,
  });

  return `${AUTH_COOKIE_KEY}=${token}`;
}

describe("/api/audit route authorization", () => {
  it("returns 401 when unauthenticated", async () => {
    const request = new NextRequest("http://localhost/api/audit", { method: "GET" });
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("returns 200 for operator", async () => {
    const request = new NextRequest("http://localhost/api/audit", {
      method: "GET",
      headers: { cookie: operatorCookie() },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);

    const payload = (await response.json()) as { entries: unknown[]; userId: string };
    expect(Array.isArray(payload.entries)).toBe(true);
    expect(payload.userId).toBe("audit-operator-id");
  });

  it("returns 200 for viewer (read-only access allowed)", async () => {
    const request = new NextRequest("http://localhost/api/audit", {
      method: "GET",
      headers: { cookie: viewerCookie() },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);

    const payload = (await response.json()) as { entries: unknown[]; userId: string };
    expect(Array.isArray(payload.entries)).toBe(true);
    expect(payload.userId).toBe("audit-viewer-id");
  });
});
