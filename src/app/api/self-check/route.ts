import { NextRequest, NextResponse } from "next/server";

import { runSelfChecks } from "@/lib/config/self-check";

export async function GET(_request: NextRequest) {
  const isProduction = process.env.NODE_ENV === "production";
  const checks = runSelfChecks(isProduction);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    checks,
  });
}
