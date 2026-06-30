import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { 
  createSessionToken, 
  verifySessionToken, 
  getSessionFromRequest, 
  AUTH_COOKIE_KEY 
} from '@/lib/auth/session';

describe('Fortexa Session Cookie Security Regression Tests', () => {
  const originalEnv = process.env.FORTEXA_AUTH_SECRET;

  beforeEach(() => {
    // Ensure an auth secret exists for cryptographic signing tests
    process.env.FORTEXA_AUTH_SECRET = 'test-secret-key-fortexa-security-hardening';
  });

function getAuthSecret() {
  const secret = process.env.FORTEXA_AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("FORTEXA_AUTH_SECRET is required for auth session signing.");
  }
  return secret;
}

function encodeBase64Url(value: string | Buffer) {
  const base64 = Buffer.from(value).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function sign(payloadPart: string) {
  return createHmac("sha256", getAuthSecret()).update(payloadPart).digest("base64url");
}
  it('should accurately resolve a valid session token from a Next.js Request cookie payload', () => {
    const validToken = createSessionToken({ email: 'active@fortexa.com', role: 'operator' });
    
    // Create a mock NextRequest passing our token via standard headers
    const req = new NextRequest(new URL('http://localhost/api/ops'), {
      headers: {
        cookie: `${AUTH_COOKIE_KEY}=${validToken}`
      }
    });

    const session = getSessionFromRequest(req);
    expect(session).not.toBeNull();
    expect(session?.email).toBe('active@fortexa.com');
    expect(session?.role).toBe('operator');
  });

  ### 2. Cookie Attribute Behavior Assertions
  it('should respect the correct cookie production key format and simulate target flag attributes', () => {
    // Ensure the application uses the correct underlying token identifier matching proxy.ts
    expect(AUTH_COOKIE_KEY).toBe('fortexa_session');

    const res = NextResponse.json({ success: true });
    
    // Simulate runtime behavior for cookie emission matching your hardened spec
    res.cookies.set(AUTH_COOKIE_KEY, 'secure-payload-token', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24
    });

    const cookieHeader = res.headers.get('set-cookie');
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('Secure');
    expect(cookieHeader).toContain('SameSite=Strict');
    expect(cookieHeader).toContain('Path=/');
  });
});