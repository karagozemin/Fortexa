import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const sharedStatePath = path.join(process.cwd(), ".fortexa", "login-lockout-shared.test.json");

describe("login lockout shared state", () => {
  afterEach(async () => {
    delete process.env.FORTEXA_SHARED_STATE_PATH;
    delete process.env.FORTEXA_AUTH_MAX_ATTEMPTS;
    delete process.env.FORTEXA_AUTH_LOCK_MINUTES;
    await rm(sharedStatePath, { force: true });
    vi.resetModules();
  });

  it("keeps lockout state across module reloads", async () => {
    process.env.FORTEXA_SHARED_STATE_PATH = sharedStatePath;
    process.env.FORTEXA_AUTH_MAX_ATTEMPTS = "2";
    process.env.FORTEXA_AUTH_LOCK_MINUTES = "1";

    const firstModule = await import("@/lib/auth/login-lockout");
    firstModule.resetLoginLockoutStore();
    firstModule.registerLoginFailure("operator@fortexa.local", "10.9.0.1");
    firstModule.registerLoginFailure("operator@fortexa.local", "10.9.0.1");

    expect(firstModule.isLoginLocked("operator@fortexa.local", "10.9.0.1").locked).toBe(true);

    vi.resetModules();

    const secondModule = await import("@/lib/auth/login-lockout");
    const lockState = secondModule.isLoginLocked("operator@fortexa.local", "10.9.0.1");

    expect(lockState.locked).toBe(true);
    expect(lockState.retryAfterSeconds).toBeGreaterThan(0);
  });
});
