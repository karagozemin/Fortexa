import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest, type AuthRole } from "@/lib/auth/session";

type RequireAuthOptions = {
  allowedRoles?: AuthRole[];
};

export function requireAuth(request: NextRequest, options?: RequireAuthOptions) {
  const session = getSessionFromRequest(request);

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized. Login required." }, { status: 401 }),
    };
  }

  const allowedRoles = options?.allowedRoles ?? ["operator", "viewer"];

  if (!allowedRoles.includes(session.role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden. Insufficient role permissions." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    session,
  };
}
