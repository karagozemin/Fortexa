import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { recordApiMetric } from "@/lib/observability/metrics";

export function jsonWithRequestContext(
  request: NextRequest,
  input: {
    route: string;
    startedAtMs: number;
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  }
) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const durationMs = Math.max(0, Date.now() - input.startedAtMs);

  recordApiMetric({
    route: input.route,
    method: request.method,
    statusCode: input.status,
    durationMs,
  });

  return NextResponse.json(input.body, {
    status: input.status,
    headers: {
      "x-request-id": requestId,
      ...input.headers,
    },
  });
}
