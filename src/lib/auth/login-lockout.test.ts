import { beforeEach, describe, expect, it } from "vitest";

import {
  clearLoginFailures,
  isLoginLocked,
  registerLoginFailure,
  resetLoginLockoutStore,
} from "@/lib/auth/login-lockout";

describe("login lockout", () => {
  beforeEach(async () => {
    process.env.FORTEXA_AUTH_MAX_ATTEMPTS = "2";
    process.env.FORTEXA_AUTH_LOCK_MINUTES = "1";
    await resetLoginLockoutStore();
  });

  it("increments failed login attempt counters", async () => {
    const email = "operator@fortexa.local";
    const ip = "127.0.0.1";

    expect((await isLoginLocked(email, ip)).locked).toBe(false);

    const first = await registerLoginFailure(email, ip);
    const second = await registerLoginFailure(email, ip);

    expect(first.attempts).toBeGreaterThanOrEqual(1);
    expect(second.attempts).toBeGreaterThan(first.attempts);
  });

  it("clears lockout state on success", async () => {
    const email = "viewer@fortexa.local";
    const ip = "127.0.0.2";

    await registerLoginFailure(email, ip);
    await registerLoginFailure(email, ip);

    expect((await isLoginLocked(email, ip)).locked).toBe(true);

    await clearLoginFailures(email, ip);
    expect((await isLoginLocked(email, ip)).locked).toBe(false);
  });
});
