import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { listAuditEntries } from "@/lib/storage/audit-store";

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const userId = auth.session.userId;
  const entries = await listAuditEntries(userId);

  return NextResponse.json({ entries, userId });
}
