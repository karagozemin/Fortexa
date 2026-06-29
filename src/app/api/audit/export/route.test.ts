/**
 * Audit export permission test matrix
 *
 * | Role          | scope=mine (JSON) | scope=mine (CSV) | scope=all (JSON) | scope=all (CSV) |
 * |---------------|-------------------|------------------|------------------|-----------------|
 * | operator      | 200 (own entries) | 200 (own entries)| 200 (all users)  | 200 (all users) |
 * | viewer        | 200 (own entries) | 200 (own entries)| 400 (blocked)    | 400 (blocked)   |
 * | unauthenticated| 401               | 401              | 401              | 401             |
 *
 * A viewer calling scope=mine MUST only receive their own AuditEntry records,
 * never another user's entries. This is enforced at the data-access layer
 * (listAuditEntries filters by auth.session.userId).
 */

import { promises as fs } from "node:fs";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  const tmpDir = `/tmp/fortexa-audit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  process.env.FORTEXA_STORE_DIR = tmpDir;
  process.env.FORTEXA_AUTH_SECRET = "audit-test-secret";
  delete process.env.DATABASE_URL;
});

import { AUTH_COOKIE_KEY, createSessionToken } from "@/lib/auth/session";
import { GET } from "@/app/api/audit/export/route";
import { appendAuditEntry, resetAuditState } from "@/lib/storage/audit-store";
import type { AuditEntry, DecisionType } from "@/lib/types/domain";

const OPERATOR_USER = "operator-audit-export";
const VIEWER_USER = "viewer-audit-export";
const OTHER_USER = "other-audit-user";

function operatorCookie() {
  const token = createSessionToken({
    email: "operator@fortexa.local",
    role: "operator",
    userId: OPERATOR_USER,
    expiresInSeconds: 120,
  });
  return `${AUTH_COOKIE_KEY}=${token}`;
}

function viewerCookie() {
  const token = createSessionToken({
    email: "viewer@fortexa.local",
    role: "viewer",
    userId: VIEWER_USER,
    expiresInSeconds: 120,
  });
  return `${AUTH_COOKIE_KEY}=${token}`;
}

function makeAuditEntry(
  userId: string,
  overrides?: Partial<AuditEntry>
): AuditEntry {
  const id = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    timestamp: new Date().toISOString(),
    action: {
      id: `action-${id}`,
      name: "test action",
      kind: "api_payment",
      target: "GB...",
      domain: "stellar.org",
      amountXLM: 10,
    },
    decision: "APPROVE" as DecisionType,
    explanation: "test entry",
    triggeredPolicies: [],
    riskFindings: [],
    ...overrides,
  };
}

function request(url: string, cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return new NextRequest(url, { method: "GET", headers });
}

beforeAll(async () => {
  await resetAuditState(OPERATOR_USER);
  await resetAuditState(VIEWER_USER);
  await resetAuditState(OTHER_USER);
});

afterAll(async () => {
  const storeDir = process.env.FORTEXA_STORE_DIR;
  if (storeDir && storeDir.startsWith("/tmp/fortexa-audit-test-")) {
    await fs.rm(storeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

describe("/api/audit/export route", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await GET(request("http://localhost/api/audit/export"));
    expect(response.status).toBe(401);
  });

  it("returns 401 when unauthenticated with csv format", async () => {
    const response = await GET(
      request("http://localhost/api/audit/export?format=csv")
    );
    expect(response.status).toBe(401);
  });

  it("exports mine scope as json for authenticated user", async () => {
    const response = await GET(
      request("http://localhost/api/audit/export?format=json&scope=mine", operatorCookie())
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      scope: string;
      userId: string;
      entries: unknown[];
    };

    expect(payload.scope).toBe("mine");
    expect(payload.userId).toBe(OPERATOR_USER);
    expect(Array.isArray(payload.entries)).toBe(true);
  });

  it("exports filtered mine scope as json", async () => {
    const response = await GET(
      request(
        "http://localhost/api/audit/export?format=json&scope=mine&from=2025-01-01T00:00:00Z&to=2030-01-01T00:00:00Z&decision=APPROVE&domain=stellar.org&actionId=test-123",
        operatorCookie()
      )
    );

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
    const response = await GET(
      request(
        "http://localhost/api/audit/export?format=csv&scope=all&from=2025-01-01T00:00:00Z&to=2030-01-01T00:00:00Z",
        operatorCookie()
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
  });

  it("returns 400 for invalid from date", async () => {
    const response = await GET(
      request("http://localhost/api/audit/export?format=json&scope=mine&from=not-a-date", operatorCookie())
    );

    expect(response.status).toBe(400);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("from");
  });

  it("returns 400 for invalid decision", async () => {
    const response = await GET(
      request("http://localhost/api/audit/export?format=json&scope=mine&decision=INVALID_DECISION", operatorCookie())
    );

    expect(response.status).toBe(400);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("decision");
  });

  it("returns 400 when viewer tries scope=all", async () => {
    const response = await GET(
      request("http://localhost/api/audit/export?format=json&scope=all", viewerCookie())
    );

    expect(response.status).toBe(400);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("Viewer");
  });

  it("allows viewer to use scope=mine", async () => {
    const response = await GET(
      request("http://localhost/api/audit/export?format=json&scope=mine", viewerCookie())
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      scope: string;
      userId: string;
      entries: unknown[];
    };

    expect(payload.scope).toBe("mine");
    expect(payload.userId).toBe(VIEWER_USER);
    expect(Array.isArray(payload.entries)).toBe(true);
  });

  describe("permission boundary tests with seeded entries", () => {
    const viewerEntry = makeAuditEntry(VIEWER_USER, { explanation: "viewer-seeded" });
    const otherEntry = makeAuditEntry(OTHER_USER, { explanation: "other-seeded" });
    const viewerEntry2 = makeAuditEntry(VIEWER_USER, { explanation: "viewer-seeded-2" });

    beforeAll(async () => {
      await resetAuditState(VIEWER_USER);
      await resetAuditState(OTHER_USER);
      await appendAuditEntry(VIEWER_USER, viewerEntry);
      await appendAuditEntry(VIEWER_USER, viewerEntry2);
      await appendAuditEntry(OTHER_USER, otherEntry);
    });

    it("viewer scope=mine returns only the viewer's own entries", async () => {
      const response = await GET(
        request("http://localhost/api/audit/export?format=json&scope=mine", viewerCookie())
      );

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        scope: string;
        userId: string;
        entries: Array<{ explanation: string }>;
      };

      expect(payload.scope).toBe("mine");
      expect(payload.userId).toBe(VIEWER_USER);
      expect(payload.entries).toHaveLength(2);
      expect(payload.entries.every((e) => e.explanation.startsWith("viewer-seeded"))).toBe(true);
    });

    it("viewer scope=mine csv returns only the viewer's own entries", async () => {
      const response = await GET(
        request("http://localhost/api/audit/export?format=csv&scope=mine", viewerCookie())
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");

      const body = await response.text();
      expect(body).toContain("viewer-seeded");
      expect(body).not.toContain("other-seeded");
    });

    it("operator scope=all json returns entries for all users", async () => {
      const response = await GET(
        request("http://localhost/api/audit/export?format=json&scope=all", operatorCookie())
      );

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        scope: string;
        entriesByUser: Record<string, Array<{ explanation: string }>>;
      };

      expect(payload.scope).toBe("all");
      expect(Object.keys(payload.entriesByUser).sort()).toEqual(
        [OTHER_USER, VIEWER_USER].sort()
      );
      const explanations = Object.values(payload.entriesByUser)
        .flat()
        .map((e) => e.explanation)
        .sort();
      expect(explanations).toEqual(["other-seeded", "viewer-seeded", "viewer-seeded-2"]);
    });

    it("operator scope=all csv returns entries for all users", async () => {
      const response = await GET(
        request("http://localhost/api/audit/export?format=csv&scope=all", operatorCookie())
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");

      const body = await response.text();
      expect(body).toContain("viewer-seeded");
      expect(body).toContain("other-seeded");
    });
  });
});
