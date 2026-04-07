import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest, type AuthRole } from "@/lib/auth/session";

type RequireAuthOptions = {
  allowedRoles?: AuthRole[];
};

export function requireAuth(request: NextRequest, options?: RequireAuthOptions) {
  const session = getSessionFromRequest(request);
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Unauthorized. Login required." },
        {
          status: 401,
          headers: { "x-request-id": requestId },
        }
      ),
    };
  }

  const allowedRoles = options?.allowedRoles ?? ["operator", "viewer"];

  if (!allowedRoles.includes(session.role)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Forbidden. Insufficient role permissions." },
        {
          status: 403,
          headers: { "x-request-id": requestId },
        }
      ),
    };
  }

  return {
    ok: true as const,
    session,
  };
}
