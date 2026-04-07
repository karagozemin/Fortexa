import { NextRequest, NextResponse } from "next/server";

import { getOrCreateUserId, USER_COOKIE_KEY } from "@/lib/auth/user-id";
import { listAuditEntries } from "@/lib/storage/audit-store";

export async function GET(request: NextRequest) {
  const { userId, shouldSetCookie } = getOrCreateUserId(request);
  const entries = await listAuditEntries(userId);

  const response = NextResponse.json({ entries, userId });

  if (shouldSetCookie) {
    response.cookies.set(USER_COOKIE_KEY, userId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}
