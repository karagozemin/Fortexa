import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json(
    { error: "Friendbot funding has been removed from this project." },
    { status: 410 }
  );
}
