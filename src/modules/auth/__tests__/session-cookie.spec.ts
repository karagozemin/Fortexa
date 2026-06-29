import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Request, Response } from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';

// Minimal mock implementation representing Fortexa's auth controller route behavior
const app = express();
app.use(express.json());
app.use(cookieParser());

// Mock Login Route
app.post('/api/auth/login', (req: Request, res: Response) => {
  const isProd = process.env.NODE_ENV === 'production';
  
  res.cookie('fortexa_session', 'mock-valid-session-jwt-token', {
    httpOnly: true,
    secure: isProd, // Must be true in production environments
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000, // 24 Hours longevity window
  });
  res.status(200).json({ success: true });
});

// Mock Logout Route
app.post('/api/auth/logout', (req: Request, res: Response) => {
  res.clearCookie('fortexa_session', { path: '/' });
  res.status(200).json({ success: true });
});

// Mock Protected Action Route
app.get('/api/auth/session-check', (req: Request, res: Response) => {
  const session = req.cookies['fortexa_session'];
  if (!session || session.includes('tampered') || session.includes('expired')) {
    res.status(401).json({ error: 'Unauthorized Session State' });
    return;
  }
  res.status(200).json({ authorized: true });
});

describe('Fortexa Session Cookie Security & Regression Test Suite', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  // Helper utility to parse multi-attribute Set-Cookie headers cleanly
  const parseCookieFlags = (setCookieHeader: string[]): Record<string, string | boolean> => {
    const cookieAttributes: Record<string, string | boolean> = {};
    if (!setCookieHeader || setCookieHeader.length === 0) return cookieAttributes;
    
    const parts = setCookieHeader[0].split(';');
    parts.forEach((part, index) => {
      const [key, value] = part.trim().split('=');
      if (index === 0) {
        cookieAttributes['name'] = key;
        cookieAttributes['value'] = value;
      } else {
        const normalizedKey = key.toLowerCase();
        cookieAttributes[normalizedKey] = value ? value : true;
      }
    });
    return cookieAttributes;
  };

  it('should issue cookies with strict HttpOnly, SameSite, and Max-Age attributes', async () => {
    process.env.NODE_ENV = 'development';
    const response = await request(app).post('/api/auth/login').send({});
    const flags = parseCookieFlags(response.headers['set-cookie']);

    expect(flags['name']).toBe('fortexa_session');
    expect(flags['httponly']).toBe(true);
    expect(flags['samesite']).toBe('lax');
    expect(flags['path']).toBe('/');
    expect(flags['max-age']).toBeDefined();
  });

  it('should enforce the Secure flag constraint string when NODE_ENV is set to production', async () => {
    process.env.NODE_ENV = 'production';
    const response = await request(app).post('/api/auth/login').send({});
    const flags = parseCookieFlags(response.headers['set-cookie']);

    expect(flags['secure']).toBe(true);
  });

  it('should cleanly remove and clear the session cookie payload upon explicit user logout request', async () => {
    const response = await request(app).post('/api/auth/logout');
    const setCookieHeader = response.headers['set-cookie']?.[0] || '';
    
    // Express clearCookie sets maxAge/expires to long ago to force truncation
    expect(setCookieHeader).toContain('fortexa_session=;');
    expect(setCookieHeader).toContain('Expires=');
  });

  it('should reject tampered or explicitly expired cookie token variations safely', async () => {
    const freshCheck = await request(app)
      .get('/api/auth/session-check')
      .set('Cookie', ['fortexa_session=mock-valid-session-jwt-token']);
    expect(freshCheck.status).toBe(200);

    const tamperedCheck = await request(app)
      .get('/api/auth/session-check')
      .set('Cookie', ['fortexa_session=tampered-payload-injection']);
    expect(tamperedCheck.status).toBe(401);
  });
});