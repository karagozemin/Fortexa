import { beforeEach, describe, expect, it } from "vitest";

import {
  ALLOWED_METHODS,
  ALLOWED_OUTCOMES,
  ALLOWED_RESULTS,
  ALLOWED_ROUTES,
  MAX_CARDINALITY,
  escapePrometheusLabelValue,
  getDecisionOutcomeCounts,
  getMetricsSnapshot,
  getStellarSubmitResultCounts,
  normalizeMethod,
  normalizeRoute,
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

  describe("allowlist and normalization (SCF high)", () => {
    it("defines a fixed allowlist of low-cardinality routes and methods", () => {
      expect(ALLOWED_ROUTES.has("/api/decision")).toBe(true);
      expect(ALLOWED_ROUTES.has("/api/stellar/submit-signed")).toBe(true);
      expect(ALLOWED_ROUTES.has("/api/metrics")).toBe(true);
      expect(ALLOWED_ROUTES.has("/other")).toBe(true);
      expect(ALLOWED_METHODS.has("GET")).toBe(true);
      expect(ALLOWED_METHODS.has("POST")).toBe(true);
      expect(ALLOWED_OUTCOMES.has("APPROVE")).toBe(true);
      expect(ALLOWED_RESULTS.has("success")).toBe(true);
    });

    it("normalizes unknown routes to /other", () => {
      expect(normalizeRoute("/api/unknown-route")).toBe("/other");
      expect(normalizeRoute("/random/path")).toBe("/other");
      expect(normalizeRoute("")).toBe("/other");
      expect(normalizeRoute("/api/decision/")).toBe("/api/decision");
    });

    it("drops wallet addresses from route labels", () => {
      const wallet = "G" + "A".repeat(55);
      // Test with a correctly formed Stellar address (G + 55 chars in base32)
      const stellarWallet = "GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR";
      expect(stellarWallet.length).toBe(56);
      recordApiMetric({ route: `/api/decision?wallet=${stellarWallet}`, method: "POST", statusCode: 200, durationMs: 10 });
      recordApiMetric({ route: `/api/stellar/submit-signed/${stellarWallet}`, method: "POST", statusCode: 200, durationMs: 10 });
      recordApiMetric({ route: stellarWallet, method: "POST", statusCode: 200, durationMs: 10 });

      const snapshot = getMetricsSnapshot();
      const routes = snapshot.routes.map((r) => r.route);
      // No raw wallet should appear as a label
      for (const r of routes) {
        expect(r).not.toContain(stellarWallet);
        expect(r).not.toContain(wallet);
      }
      // Wallet-containing inputs should collapse to /other, query strings are stripped so wallet not leaked
      expect(normalizeRoute(stellarWallet)).toBe("/other");
      expect(normalizeRoute(`/api/decision?wallet=${stellarWallet}`)).toBe("/api/decision");
      expect(normalizeRoute(`/api/stellar/submit-signed/${stellarWallet}`)).toBe("/other");
    });

    it("drops free-text and request values from route labels", () => {
      recordApiMetric({ route: "free text with spaces", method: "POST", statusCode: 200, durationMs: 10 });
      recordApiMetric({ route: 'injection"quote', method: "POST", statusCode: 200, durationMs: 10 });
      recordApiMetric({ route: "a".repeat(200), method: "POST", statusCode: 200, durationMs: 10 });
      recordApiMetric({ route: "/api/decision?memo=hello world&amount=100", method: "POST", statusCode: 200, durationMs: 10 });

      const snapshot = getMetricsSnapshot();
      for (const r of snapshot.routes) {
        expect(r.route).not.toContain(" ");
        expect(r.route).not.toContain('"');
        expect(r.route.length).toBeLessThanOrEqual(128);
      }
      expect(normalizeRoute("free text with spaces")).toBe("/other");
      expect(normalizeRoute('injection"quote')).toBe("/other");
      expect(normalizeRoute("a".repeat(200))).toBe("/other");
    });

    it("normalizes method to allowlist and uses UNKNOWN for disallowed verbs", () => {
      expect(normalizeMethod("post")).toBe("POST");
      expect(normalizeMethod("GeT")).toBe("GET");
      expect(normalizeMethod("WALLET")).toBe("UNKNOWN");
      expect(normalizeMethod("PURGE")).toBe("UNKNOWN");
      expect(normalizeMethod("")).toBe("UNKNOWN");
    });

    it("drops disallowed decision outcomes and stellar results", () => {
      // @ts-expect-error testing runtime guard
      recordDecisionOutcome("G" + "A".repeat(55));
      // @ts-expect-error freetext injection
      recordDecisionOutcome("APPROVE; wallet=G123");
      // @ts-expect-error
      recordDecisionOutcome("free-text");
      // @ts-expect-error
      recordStellarSubmitResult("wallet_leak_payload");
      // @ts-expect-error
      recordStellarSubmitResult("G12345");

      expect(getDecisionOutcomeCounts().size).toBe(0);
      expect(getStellarSubmitResultCounts().size).toBe(0);

      // Allowed values still work
      recordDecisionOutcome("APPROVE");
      recordStellarSubmitResult("success");
      expect(getDecisionOutcomeCounts().get("APPROVE")).toBe(1);
      expect(getStellarSubmitResultCounts().get("success")).toBe(1);
    });
  });

  describe("redaction", () => {
    it("never exposes wallet addresses in prometheus text", () => {
      const wallet = "GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR";
      recordApiMetric({ route: wallet, method: "POST", statusCode: 200, durationMs: 10 });
      recordApiMetric({ route: `/api/decision?wallet=${wallet}`, method: "POST", statusCode: 200, durationMs: 10 });
      // Also try to inject via outcome/result with wallet-like string (should be dropped)
      // @ts-expect-error
      recordDecisionOutcome(wallet);
      // @ts-expect-error
      recordStellarSubmitResult(wallet);

      const output = toPrometheusText();
      expect(output).not.toContain(wallet);
      expect(output).not.toContain("GA5Z");
    });

    it("escapes prometheus label values", () => {
      expect(escapePrometheusLabelValue('a"b')).toBe('a\\"b');
      expect(escapePrometheusLabelValue("a\\b")).toBe("a\\\\b");
      expect(escapePrometheusLabelValue("a\nb")).toBe("a\\nb");
      expect(escapePrometheusLabelValue("/api/decision")).toBe("/api/decision");
    });

    it("prometheus output only contains allowlisted label values", () => {
      recordApiMetric({ route: "/api/decision", method: "POST", statusCode: 200, durationMs: 10 });
      recordApiMetric({ route: "/api/unknown", method: "POST", statusCode: 200, durationMs: 10 });
      recordDecisionOutcome("APPROVE");
      recordStellarSubmitResult("success");

      const output = toPrometheusText();
      // Extract route labels
      const routeLabels = [...output.matchAll(/route="([^"]+)"/g)].map((m) => m[1]);
      for (const label of routeLabels) {
        // After escaping, unescaped value should be in allowlist
        const unescaped = label.replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n");
        expect(ALLOWED_ROUTES.has(unescaped)).toBe(true);
      }
      const outcomeLabels = [...output.matchAll(/outcome="([^"]+)"/g)].map((m) => m[1]);
      for (const label of outcomeLabels) {
        expect(ALLOWED_OUTCOMES.has(label as never)).toBe(true);
      }
      const resultLabels = [...output.matchAll(/result="([^"]+)"/g)].map((m) => m[1]);
      for (const label of resultLabels) {
        expect(ALLOWED_RESULTS.has(label as never)).toBe(true);
      }
    });
  });

  describe("cardinality regression", () => {
    it("collapses unbounded wallet routes to a bounded number of series", () => {
      const baseWallet = "GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR";
      for (let i = 0; i < 200; i++) {
        // Simulate attacker creating 200 unique wallet-like routes
        const walletVariant = `G${String(i).padStart(55, "A")}`;
        recordApiMetric({ route: `/api/decision?wallet=${walletVariant}`, method: "POST", statusCode: 200, durationMs: 10 });
        recordApiMetric({ route: `/tmp/request-${i}-${baseWallet}-${i}`, method: "POST", statusCode: 200, durationMs: 10 });
        recordApiMetric({ route: `free text payment ${i} for ${walletVariant}`, method: "POST", statusCode: 200, durationMs: 10 });
      }

      const snapshot = getMetricsSnapshot();
      // All attacker-controlled routes collapse to /other, so number of series stays low
      expect(snapshot.routes.length).toBeLessThanOrEqual(5);
      expect(snapshot.routes.length).toBeGreaterThan(0);
      // No high-cardinality wallet strings in snapshot
      for (const r of snapshot.routes) {
        expect(r.route).not.toMatch(/G[A-Z2-7]{55}/);
        expect(ALLOWED_ROUTES.has(r.route)).toBe(true);
      }
    });

    it("enforces MAX_CARDINALITY cap for distinct series", () => {
      // Feed many distinct allowed routes with distinct methods (up to limit)
      // Since allowlist collapses unknowns to /other, the only way to grow cardinality
      // is via allowed routes. Verify that snapshot never exceeds MAX_CARDINALITY
      // even when an attacker tries to create many series via method variation.
      const wallet = "GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR";
      for (let i = 0; i < 300; i++) {
        // Use wallet in route – should collapse to /other, not create new series
        recordApiMetric({ route: `/attack/${i}/${wallet}`, method: `METHOD${i}`, statusCode: 200, durationMs: 10 });
      }
      // Also record all legitimate routes
      for (const route of ALLOWED_ROUTES) {
        for (const method of ALLOWED_METHODS) {
          recordApiMetric({ route, method, statusCode: 200, durationMs: 10 });
        }
      }
      const snapshot = getMetricsSnapshot();
      expect(snapshot.routes.length).toBeLessThanOrEqual(MAX_CARDINALITY);
      // Every route in snapshot must be from allowlist
      for (const r of snapshot.routes) {
        expect(ALLOWED_ROUTES.has(r.route)).toBe(true);
      }
    });
  });
});
