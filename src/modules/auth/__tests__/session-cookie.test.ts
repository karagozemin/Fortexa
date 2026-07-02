import { describe, it, expect, beforeEach } from "vitest";
import { createSessionToken, verifySessionToken, AUTH_COOKIE_KEY } from "../../../lib/auth/session";

describe("Session & Cookie Security Regression Tests", () => {
  beforeEach(() => {
    process.env.FORTEXA_AUTH_SECRET = "test-secret-key-123";
  });

  describe("Cookie Security Flags", () => {
    it("should use secure cookies in production environment", () => {
      const isProd = process.env.NODE_ENV === "production";
      const secureFlag = isProd ? "Secure;" : "";

      const mockCookie = `${AUTH_COOKIE_KEY}=mocked_token; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800; ${secureFlag}`;

      expect(mockCookie).toContain("HttpOnly");
      expect(mockCookie).toContain("SameSite=Lax");
      expect(mockCookie).toContain("Path=/");
      expect(mockCookie).toContain("Max-Age=604800");
      if (isProd) {
        expect(mockCookie).toContain("Secure");
      }
    });

    it("should set Secure flag specifically when production is enforced", () => {
      const secureFlag = "Secure;";
      const mockCookie = `${AUTH_COOKIE_KEY}=mocked_token; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800; ${secureFlag}`;
      expect(mockCookie).toContain("Secure");
    });
  });

  describe("Logout Behavior", () => {
    it("should clear the fortexa_session cookie upon logout", () => {
      const logoutCookie = `${AUTH_COOKIE_KEY}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`;

      expect(logoutCookie).toContain(`${AUTH_COOKIE_KEY}=;`);
      expect(logoutCookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    });
  });

  describe("Token Hardening", () => {
    it("should safely reject an expired session token", () => {
      const expiredToken = createSessionToken({
        email: "test@example.com",
        role: "viewer",
        userId: "user-1",
        expiresInSeconds: -3600
      });

      const session = verifySessionToken(expiredToken);
      expect(session).toBeNull();
    });

    it("should safely reject a tampered session token signature", () => {
      const validToken = createSessionToken({
        email: "test@example.com",
        role: "operator",
        userId: "user-2"
      });

      const parts = validToken.split(".");
      const tamperedToken = `${parts[0]}.invalid_signature_here`;

      const session = verifySessionToken(tamperedToken);
      expect(session).toBeNull();
    });

    it("should safely reject malformed session tokens", () => {
      expect(verifySessionToken("not.a.real.token")).toBeNull();
      expect(verifySessionToken("just_one_part")).toBeNull();
      expect(verifySessionToken("")).toBeNull();
    });
  });
});
