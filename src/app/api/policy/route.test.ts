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

const POLICY_PAYLOAD = {
  allowedDomains: ["api.safe-research.ai"],
  blockedDomains: ["wallet-drainer.evil"],
  allowedTools: ["research-pro"],
  blockedTools: ["shadow-shell"],
  perTxCapXLM: 150,
  dailyCapXLM: 500,
  maxToolCallsPerDay: 12,
  riskThreshold: 80,
  allowedHours: { start: 5, end: 22 },
};

function makePolicyPostRequest(cookie: string, body: unknown) {
  return new NextRequest("http://localhost/api/policy", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify(body),
  });
}

function makePolicyGetRequest(cookie: string) {
  return new NextRequest("http://localhost/api/policy", {
    method: "GET",
    headers: { cookie },
  });
}

describe("/api/policy route", () => {
  it("returns 401 when unauthenticated", async () => {
    const request = new NextRequest("http://localhost/api/policy", { method: "GET" });
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("allows operator to update and read policy", async () => {
    const cookie = operatorCookie();

    // Seed with no expectedVersion to remain backward compatible.
    const response = await POST(makePolicyPostRequest(cookie, POLICY_PAYLOAD));
    expect(response.status).toBe(200);

    const readResponse = await GET(makePolicyGetRequest(cookie));
    expect(readResponse.status).toBe(200);

    const payload = (await readResponse.json()) as {
      policy: { perTxCapXLM: number; riskThreshold: number };
      version: number;
    };

    expect(payload.policy.perTxCapXLM).toBe(150);
    expect(payload.policy.riskThreshold).toBe(80);
    expect(typeof payload.version).toBe("number");
  });

  it("accepts a save that includes the current expectedVersion (200) and advances the version", async () => {
    const cookie = operatorCookie();

    const initialRead = await GET(makePolicyGetRequest(cookie));
    const initialPayload = (await initialRead.json()) as { version: number };

    const response = await POST(
      makePolicyPostRequest(cookie, {
        ...POLICY_PAYLOAD,
        perTxCapXLM: 175,
        expectedVersion: initialPayload.version,
      }),
    );

    expect(response.status).toBe(200);
    const saved = (await response.json()) as {
      policy: { perTxCapXLM: number };
      version: number;
    };

    expect(saved.policy.perTxCapXLM).toBe(175);
    expect(saved.version).toBe(initialPayload.version + 1);
  });

  it("rejects a stale save (mismatched expectedVersion) with 409 and does not advance the version", async () => {
    const cookie = operatorCookie();

    // Bring the server to a known fresh state.
    const seed = await POST(makePolicyPostRequest(cookie, POLICY_PAYLOAD));
    expect(seed.status).toBe(200);
    const seedBody = (await seed.json()) as { version: number };

    // First operator saves successfully, bumping the version by one.
    const firstSave = await POST(
      makePolicyPostRequest(cookie, {
        ...POLICY_PAYLOAD,
        perTxCapXLM: 200,
        expectedVersion: seedBody.version,
      }),
    );
    expect(firstSave.status).toBe(200);
    const firstSaveBody = (await firstSave.json()) as { version: number };
    expect(firstSaveBody.version).toBe(seedBody.version + 1);

    // Second operator's save is still based on the old (stale) version — reject.
    const staleSave = await POST(
      makePolicyPostRequest(cookie, {
        ...POLICY_PAYLOAD,
        perTxCapXLM: 999,
        expectedVersion: seedBody.version,
      }),
    );

    expect(staleSave.status).toBe(409);
    const conflict = (await staleSave.json()) as {
      code: string;
      error: string;
      expectedVersion: number;
      currentVersion: number;
      currentUpdatedAt: string | null;
    };

    expect(conflict.code).toBe("POLICY_VERSION_CONFLICT");
    expect(conflict.expectedVersion).toBe(seedBody.version);
    expect(conflict.currentVersion).toBe(firstSaveBody.version);
    expect(typeof conflict.currentUpdatedAt).toBe("string");

    // The stale save must NOT have changed the live version.
    const verifyRead = await GET(makePolicyGetRequest(cookie));
    const verifyBody = (await verifyRead.json()) as {
      policy: { perTxCapXLM: number };
      version: number;
    };
    expect(verifyBody.version).toBe(firstSaveBody.version);
    expect(verifyBody.policy.perTxCapXLM).toBe(200);
  });

  it("accepts an omitted expectedVersion for backward compatibility", async () => {
    const cookie = operatorCookie();

    // No `expectedVersion` provided — should succeed and bump the version.
    const response = await POST(
      makePolicyPostRequest(cookie, {
        ...POLICY_PAYLOAD,
        perTxCapXLM: 222,
      }),
    );

    expect(response.status).toBe(200);
    const saved = (await response.json()) as {
      policy: { perTxCapXLM: number };
      version: number;
    };
    expect(saved.policy.perTxCapXLM).toBe(222);
    expect(typeof saved.version).toBe("number");
  });

  it("rejects an invalid expectedVersion with 400", async () => {
    const cookie = operatorCookie();

    const response = await POST(
      makePolicyPostRequest(cookie, {
        ...POLICY_PAYLOAD,
        expectedVersion: -1,
      }),
    );

    expect(response.status).toBe(400);
  });
});
