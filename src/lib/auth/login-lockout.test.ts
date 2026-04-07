import { beforeEach, describe, expect, it } from "vitest";

import {
  clearLoginFailures,
  isLoginLocked,
  registerLoginFailure,
  resetLoginLockoutStore,
} from "@/lib/auth/login-lockout";

describe("login lockout", () => {
  beforeEach(() => {
    process.env.FORTEXA_AUTH_MAX_ATTEMPTS = "2";
    process.env.FORTEXA_AUTH_LOCK_MINUTES = "1";
    resetLoginLockoutStore();
  });

  it("increments failed login attempt counters", () => {
    const email = "operator@fortexa.local";
    const ip = "127.0.0.1";

    expect(isLoginLocked(email, ip).locked).toBe(false);

    const first = registerLoginFailure(email, ip);
    const second = registerLoginFailure(email, ip);

    expect(first.attempts).toBeGreaterThanOrEqual(1);
    expect(second.attempts).toBeGreaterThan(first.attempts);
  });

  it("clears lockout state on success", () => {
    const email = "viewer@fortexa.local";
    const ip = "127.0.0.2";

    registerLoginFailure(email, ip);
    registerLoginFailure(email, ip);

    expect(isLoginLocked(email, ip).locked).toBe(true);

    clearLoginFailures(email, ip);
    expect(isLoginLocked(email, ip).locked).toBe(false);
  });
});
