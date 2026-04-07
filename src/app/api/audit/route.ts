import { NextResponse } from "next/server";

import { listAuditEntries } from "@/lib/storage/audit-store";

export async function GET() {
  return NextResponse.json({ entries: listAuditEntries() });
}
