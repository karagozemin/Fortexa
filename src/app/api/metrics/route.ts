import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { jsonWithRequestContext } from "@/lib/observability/http";
import { getMetricsSnapshot, toPrometheusText } from "@/lib/observability/metrics";

export async function GET(request: NextRequest) {
  const startedAtMs = Date.now();
  const auth = requireAuth(request, { allowedRoles: ["operator"] });

  if (!auth.ok) {
    return auth.response;
  }

  const format = request.nextUrl.searchParams.get("format")?.toLowerCase();

  if (format === "prometheus") {
    return new NextResponse(toPrometheusText(), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        "x-request-id": request.headers.get("x-request-id") ?? crypto.randomUUID(),
      },
    });
  }

  return jsonWithRequestContext(request, {
    route: "/api/metrics",
    startedAtMs,
    status: 200,
    body: getMetricsSnapshot(),
  });
}
