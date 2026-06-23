import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBlocklist, getBlocklistHealth, resetBlocklistCache } from "@/lib/security/blocklist";

describe("blocklist health", () => {
  beforeEach(() => {
    delete process.env.FORTEXA_BLOCKLIST_URL;
    resetBlocklistCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.FORTEXA_BLOCKLIST_URL;
    resetBlocklistCache();
  });

  it("reports unconfigured when FORTEXA_BLOCKLIST_URL is not set", () => {
    const health = getBlocklistHealth();
    expect(health.configured).toBe(false);
    expect(health.lastRefreshAt).toBeNull();
    expect(health.domainCount).toBe(0);
    expect(health.lastError).toBeNull();
  });

  it("reports configured with domain count and refresh timestamp after successful fetch", async () => {
    process.env.FORTEXA_BLOCKLIST_URL = "https://example.com/blocklist.json";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(["bad-actor.com", "scam.io"]), { status: 200 })
    );

    const domains = await fetchBlocklist();
    expect(domains).toEqual(["bad-actor.com", "scam.io"]);

    const health = getBlocklistHealth();
    expect(health.configured).toBe(true);
    expect(health.domainCount).toBe(2);
    expect(health.lastRefreshAt).toBeTruthy();
    expect(health.lastError).toBeNull();
  });

  it("reports last error summary after a failed fetch", async () => {
    process.env.FORTEXA_BLOCKLIST_URL = "https://example.com/blocklist.json";
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const domains = await fetchBlocklist();
    expect(domains).toEqual([]);

    const health = getBlocklistHealth();
    expect(health.configured).toBe(true);
    expect(health.lastError).toBe("Network error");
    expect(health.domainCount).toBe(0);
  });

  it("reports stale cache and error when fetch fails after a prior success", async () => {
    process.env.FORTEXA_BLOCKLIST_URL = "https://example.com/blocklist.json";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(["bad-actor.com"]), { status: 200 })
    );
    await fetchBlocklist();

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 10 * 60 * 1000);

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Timeout"));

    const domains = await fetchBlocklist();
    expect(domains).toEqual(["bad-actor.com"]);

    const health = getBlocklistHealth();
    expect(health.configured).toBe(true);
    expect(health.lastError).toBe("Timeout");
    expect(health.domainCount).toBe(1);
    expect(health.lastRefreshAt).toBeTruthy();
  });

  it("returns empty array and reports error on HTTP error", async () => {
    process.env.FORTEXA_BLOCKLIST_URL = "https://example.com/blocklist.json";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Service Unavailable", { status: 503 })
    );

    const domains = await fetchBlocklist();
    expect(domains).toEqual([]);

    const health = getBlocklistHealth();
    expect(health.lastError).toBe("HTTP 503");
  });
});
