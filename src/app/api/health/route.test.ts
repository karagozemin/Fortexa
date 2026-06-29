import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const mockRoot = vi.fn();
vi.mock("@/lib/stellar/client", () => ({
  getHorizonServer: () => ({
    root: mockRoot,
  }),
}));

const mockRunWithDatabase = vi.fn();
vi.mock("@/lib/storage/db", () => ({
  runWithDatabase: (...args: unknown[]) => mockRunWithDatabase(...args),
}));

const mockGetBlocklistHealth = vi.fn();
vi.mock("@/lib/security/blocklist", () => ({
  getBlocklistHealth: () => mockGetBlocklistHealth(),
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GROQ_API_KEY;
    delete process.env.FORTEXA_AUTH_SECRET;
    delete process.env.STELLAR_HORIZON_URL;
  });

  it("returns healthy states when dependencies are configured and reachable", async () => {
    process.env.GROQ_API_KEY = "test-key";
    process.env.STELLAR_HORIZON_URL = "https://horizon.example.com";

    mockRunWithDatabase.mockResolvedValue({ available: true });
    mockRoot.mockResolvedValue({});
    mockGetBlocklistHealth.mockReturnValue({
      configured: true,
      lastRefreshAt: new Date().toISOString(),
      domainCount: 10,
      lastError: null,
    });

    const req = new NextRequest("http://localhost:3000/api/health");
    const response = await GET(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.dependencies.storage).toBe("healthy");
    expect(json.dependencies.horizon).toBe("healthy");
    expect(json.dependencies.groq).toBe("healthy");
    expect(json.dependencies.blocklist).toBe("healthy");
  });

  it("returns degraded states when dependencies fail or have errors", async () => {
    process.env.STELLAR_HORIZON_URL = "https://horizon.example.com";

    mockRunWithDatabase.mockResolvedValue({ available: false });
    mockRoot.mockRejectedValue(new Error("Timeout"));
    mockGetBlocklistHealth.mockReturnValue({
      configured: true,
      lastRefreshAt: new Date().toISOString(),
      domainCount: 10,
      lastError: "Feed unreachable",
    });

    const req = new NextRequest("http://localhost:3000/api/health");
    const response = await GET(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.dependencies.storage).toBe("degraded");
    expect(json.dependencies.horizon).toBe("degraded");
    expect(json.dependencies.blocklist).toBe("degraded");
  });

  it("returns unconfigured/unknown states when optional dependencies are missing", async () => {
    mockRunWithDatabase.mockResolvedValue({ available: false });
    mockGetBlocklistHealth.mockReturnValue({
      configured: false,
      lastRefreshAt: null,
      domainCount: 0,
      lastError: null,
    });

    const req = new NextRequest("http://localhost:3000/api/health");
    const response = await GET(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.dependencies.groq).toBe("unconfigured");
    expect(json.dependencies.horizon).toBe("unknown");
    expect(json.dependencies.blocklist).toBe("unconfigured");
  });
});
