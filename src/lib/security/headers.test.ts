import { afterEach, describe, expect, it, vi } from "vitest";

import { buildSecurityHeaders } from "./headers";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildSecurityHeaders", () => {
  it("returns X-Content-Type-Options: nosniff", () => {
    const headers = buildSecurityHeaders();
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("returns X-Frame-Options: DENY", () => {
    const headers = buildSecurityHeaders();
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });

  it("returns Content-Security-Policy with expected directives", () => {
    const headers = buildSecurityHeaders();
    const csp = headers["Content-Security-Policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("returns Permissions-Policy disabling camera, microphone, geolocation", () => {
    const headers = buildSecurityHeaders();
    expect(headers["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("includes unsafe-inline and unsafe-eval in script-src in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const headers = buildSecurityHeaders();
    expect(headers["Content-Security-Policy"]).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    );
  });

  it("omits unsafe-inline from script-src in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const headers = buildSecurityHeaders();
    const csp = headers["Content-Security-Policy"];
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });
});
