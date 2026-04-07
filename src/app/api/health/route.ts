import { NextRequest, NextResponse } from "next/server";

import { getRequestLogContext, logInfo } from "@/lib/observability/logger";

export async function GET(request: NextRequest) {
  const context = getRequestLogContext(request, "/api/health");

  logInfo("Health check requested", context);

  const env = {
    hasGroqKey: Boolean(process.env.GROQ_API_KEY),
    hasAuthSecret: Boolean(process.env.FORTEXA_AUTH_SECRET),
    hasHorizonUrl: Boolean(process.env.STELLAR_HORIZON_URL),
  };

  return NextResponse.json({
    ok: true,
    service: "fortexa",
    timestamp: new Date().toISOString(),
    env,
  });
}
