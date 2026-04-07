import { beforeEach, describe, expect, it } from "vitest";

import { getMetricsSnapshot, recordApiMetric, resetMetrics, toPrometheusText } from "@/lib/observability/metrics";

describe("observability metrics", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("tracks request counters and error rate", () => {
    recordApiMetric({ route: "/api/decision", method: "POST", statusCode: 200, durationMs: 40 });
    recordApiMetric({ route: "/api/decision", method: "POST", statusCode: 500, durationMs: 80 });

    const snapshot = getMetricsSnapshot();
    const routeMetric = snapshot.routes.find((route) => route.route === "/api/decision");

    expect(routeMetric).toBeDefined();
    expect(routeMetric?.totalCount).toBe(2);
    expect(routeMetric?.errorCount).toBe(1);
    expect(routeMetric?.errorRate).toBe(0.5);
    expect(routeMetric?.p95DurationMs).toBe(80);
  });

  it("renders prometheus text output", () => {
    recordApiMetric({ route: "/api/policy", method: "GET", statusCode: 200, durationMs: 20 });

    const output = toPrometheusText();

    expect(output).toContain("fortexa_requests_total");
    expect(output).toContain('route="/api/policy"');
  });
});
