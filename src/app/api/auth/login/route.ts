import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_COOKIE_KEY, type AuthRole, createSessionToken } from "@/lib/auth/session";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4).max(200),
});

function resolveRoleByCredentials(email: string, password: string): AuthRole | null {
  const normalizedEmail = email.trim().toLowerCase();

  const operatorEmail = process.env.FORTEXA_OPERATOR_EMAIL?.trim().toLowerCase();
  const operatorPassword = process.env.FORTEXA_OPERATOR_PASSWORD;

  if (operatorEmail && operatorPassword && normalizedEmail === operatorEmail && password === operatorPassword) {
    return "operator";
  }

  const viewerEmail = process.env.FORTEXA_VIEWER_EMAIL?.trim().toLowerCase();
  const viewerPassword = process.env.FORTEXA_VIEWER_PASSWORD;

  if (viewerEmail && viewerPassword && normalizedEmail === viewerEmail && password === viewerPassword) {
    return "viewer";
  }

  return null;
}

export async function POST(request: NextRequest) {
  const rate = consumeRateLimit(request, {
    key: "auth-login",
    limit: 15,
    windowMs: 60_000,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429, headers: rateLimitHeaders(rate) }
    );
  }

  try {
    const rawBody = (await request.json().catch(() => ({}))) as unknown;
    const parsed = loginSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid login payload.", details: parsed.error.flatten() },
        { status: 400, headers: rateLimitHeaders(rate) }
      );
    }

    const role = resolveRoleByCredentials(parsed.data.email, parsed.data.password);

    if (!role) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401, headers: rateLimitHeaders(rate) });
    }

    const token = createSessionToken({
      email: parsed.data.email,
      role,
    });

    const response = NextResponse.json(
      {
        ok: true,
        role,
        email: parsed.data.email,
      },
      { headers: rateLimitHeaders(rate) }
    );

    response.cookies.set(AUTH_COOKIE_KEY, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login failed." },
      { status: 500, headers: rateLimitHeaders(rate) }
    );
  }
}
