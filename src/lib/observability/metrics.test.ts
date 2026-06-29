import { beforeEach, describe, expect, it } from "vitest";

import {
  getDecisionOutcomeCounts,
  getMetricsSnapshot,
  getStellarSubmitResultCounts,
  recordApiMetric,
  recordDecisionOutcome,
  recordStellarSubmitResult,
  resetMetrics,
  toPrometheusText,
} from "@/lib/observability/metrics";

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

  it("increments decision outcome counters (success path)", () => {
    recordDecisionOutcome("APPROVE");
    recordDecisionOutcome("APPROVE");
    recordDecisionOutcome("WARN");

    const counts = getDecisionOutcomeCounts();
    expect(counts.get("APPROVE")).toBe(2);
    expect(counts.get("WARN")).toBe(1);
    expect(counts.get("REQUIRE_APPROVAL")).toBeUndefined();
    expect(counts.get("BLOCK")).toBeUndefined();
  });

  it("increments decision outcome counters (failure path)", () => {
    recordDecisionOutcome("BLOCK");

    const counts = getDecisionOutcomeCounts();
    expect(counts.get("BLOCK")).toBe(1);
    expect(counts.get("APPROVE")).toBeUndefined();
  });

  it("increments stellar submit result counters (success path)", () => {
    recordStellarSubmitResult("success");
    recordStellarSubmitResult("success");
    recordStellarSubmitResult("idempotency_replay");

    const counts = getStellarSubmitResultCounts();
    expect(counts.get("success")).toBe(2);
    expect(counts.get("idempotency_replay")).toBe(1);
    expect(counts.get("horizon_failure")).toBeUndefined();
  });

  it("increments stellar submit result counters (failure path)", () => {
    recordStellarSubmitResult("horizon_failure");
    recordStellarSubmitResult("idempotency_conflict");

    const counts = getStellarSubmitResultCounts();
    expect(counts.get("horizon_failure")).toBe(1);
    expect(counts.get("idempotency_conflict")).toBe(1);
    expect(counts.get("success")).toBeUndefined();
  });

  it("includes new counters in prometheus text output", () => {
    recordDecisionOutcome("APPROVE");
    recordStellarSubmitResult("success");

    const output = toPrometheusText();
    expect(output).toContain("fortexa_decision_outcomes_total");
    expect(output).toContain('outcome="APPROVE"');
    expect(output).toContain("fortexa_stellar_submit_results_total");
    expect(output).toContain('result="success"');
  });

  it("resets new counters alongside existing buckets", () => {
    recordDecisionOutcome("WARN");
    recordStellarSubmitResult("success");
    resetMetrics();

    expect(getDecisionOutcomeCounts().size).toBe(0);
    expect(getStellarSubmitResultCounts().size).toBe(0);
  });
});
