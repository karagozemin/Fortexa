import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { getMetricsSnapshot, recordApiMetric, toPrometheusText } from "@/lib/observability/metrics";

export async function GET(request: NextRequest) {
  const auth = requireAuth(request, { allowedRoles: ["operator"] });

  if (!auth.ok) {
    return auth.response;
  }

  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const format = request.nextUrl.searchParams.get("format")?.toLowerCase();

  recordApiMetric({
    route: "/api/metrics",
    method: request.method,
    statusCode: 200,
    durationMs: 0,
  });

  if (format === "prometheus") {
    return new NextResponse(toPrometheusText(), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        "x-request-id": requestId,
      },
    });
  }

  return NextResponse.json(getMetricsSnapshot(), {
    status: 200,
    headers: {
      "x-request-id": requestId,
    },
  });
}
