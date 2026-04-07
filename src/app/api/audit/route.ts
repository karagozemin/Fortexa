import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { jsonWithRequestContext } from "@/lib/observability/http";
import { listAuditEntries } from "@/lib/storage/audit-store";

export async function GET(request: NextRequest) {
  const startedAtMs = Date.now();
  const auth = requireAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const userId = auth.session.userId;
  const entries = await listAuditEntries(userId);

  return jsonWithRequestContext(request, {
    route: "/api/audit",
    startedAtMs,
    status: 200,
    body: { entries, userId },
  });
}
