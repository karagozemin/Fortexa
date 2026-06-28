import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/policy/rollback/preview/route";
import { AUTH_COOKIE_KEY, createSessionToken } from "@/lib/auth/session";
import { defaultPolicyConfig } from "@/lib/policy/engine";
import { getDailyUsage } from "@/lib/storage/audit-store";
import { getPolicyConfig, updatePolicyConfig } from "@/lib/storage/policy-store";
import type { SimulationReport } from "@/lib/decision/simulate";

const USER_ID = "rollback-preview-route-user";

function operatorCookie() {
  process.env.FORTEXA_AUTH_SECRET = "rollback-preview-test-secret";
  const token = createSessionToken({
    email: "operator@fortexa.local",
    role: "operator",
    userId: USER_ID,
    expiresInSeconds: 120,
  });

  return `${AUTH_COOKIE_KEY}=${token}`;
}

describe("/api/policy/rollback/preview route", () => {
  it("returns 401 when unauthenticated", async () => {
    const request = new NextRequest("http://localhost/api/policy/rollback/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetVersion: 1 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns rollback impact without mutating policy state", async () => {
    await updatePolicyConfig({ ...defaultPolicyConfig, perTxCapXLM: 250 }, USER_ID);
    const before = await getPolicyConfig();
    const usageBefore = await getDailyUsage(USER_ID);

    const request = new NextRequest("http://localhost/api/policy/rollback/preview", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: operatorCookie(),
      },
      body: JSON.stringify({ targetVersion: 1 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      report: SimulationReport;
      targetVersion: number;
      currentVersion: number;
    };

    expect(payload.targetVersion).toBe(1);
    expect(payload.currentVersion).toBe(before.version);
    expect(payload.report.summary.total).toBeGreaterThan(0);

    const after = await getPolicyConfig();
    const usageAfter = await getDailyUsage(USER_ID);
    expect(after.version).toBe(before.version);
    expect(after.policy.perTxCapXLM).toBe(before.policy.perTxCapXLM);
    expect(usageAfter).toEqual(usageBefore);
  });
});
