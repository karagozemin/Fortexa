import { rm } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const sharedStatePath = path.join(process.cwd(), ".fortexa", "rate-limit-shared.test.json");

function requestFromIp(ip: string) {
  return new NextRequest("http://localhost/api/test", {
    method: "GET",
    headers: {
      "x-forwarded-for": ip,
    },
  });
}

describe("rate limit shared state", () => {
  afterEach(async () => {
    delete process.env.FORTEXA_SHARED_STATE_PATH;
    await rm(sharedStatePath, { force: true });
    vi.resetModules();
  });

  it("persists bucket state across module reloads", async () => {
    process.env.FORTEXA_SHARED_STATE_PATH = sharedStatePath;

    const firstModule = await import("@/lib/security/rate-limit");
    firstModule.resetRateLimitStore();

    const firstResult = firstModule.consumeRateLimit(requestFromIp("10.0.0.4"), {
      key: "shared-test",
      limit: 1,
      windowMs: 60_000,
    });

    expect(firstResult.ok).toBe(true);

    vi.resetModules();

    const secondModule = await import("@/lib/security/rate-limit");
    const secondResult = secondModule.consumeRateLimit(requestFromIp("10.0.0.4"), {
      key: "shared-test",
      limit: 1,
      windowMs: 60_000,
    });

    expect(secondResult.ok).toBe(false);
    expect(secondResult.retryAfterSeconds).toBeGreaterThan(0);
  });
});
