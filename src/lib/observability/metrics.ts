type MetricKey = `${string}:${string}`;

export type DecisionOutcome = "APPROVE" | "WARN" | "REQUIRE_APPROVAL" | "BLOCK";
export type StellarSubmitResult =
  | "success"
  | "horizon_failure"
  | "validation_failure"
  | "idempotency_replay"
  | "idempotency_conflict"
  | "source_wallet_mismatch";

export const ALLOWED_ROUTES = new Set<string>([
  "/api/auth/challenge",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/refresh",
  "/api/auth/session",
  "/api/auth/wallet/revoke",
  "/api/decision",
  "/api/policy",
  "/api/policy/history",
  "/api/policy/validate",
  "/api/policy/simulate",
  "/api/policy/rollback",
  "/api/policy/rollback/preview",
  "/api/agent/plan",
  "/api/health",
  "/api/metrics",
  "/api/stellar/balance",
  "/api/stellar/build-payment",
  "/api/stellar/fund",
  "/api/stellar/pay",
  "/api/stellar/setup",
  "/api/stellar/submit-signed",
  "/api/audit",
  "/api/audit/export",
  "/api/audit/integrity",
  "/other",
]);

export const ALLOWED_METHODS = new Set<string>([
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
]);

export const ALLOWED_OUTCOMES: ReadonlySet<DecisionOutcome> = new Set<DecisionOutcome>([
  "APPROVE",
  "WARN",
  "REQUIRE_APPROVAL",
  "BLOCK",
]);

export const ALLOWED_RESULTS: ReadonlySet<StellarSubmitResult> = new Set<StellarSubmitResult>([
  "success",
  "horizon_failure",
  "validation_failure",
  "idempotency_replay",
  "idempotency_conflict",
  "source_wallet_mismatch",
]);

/**
 * Maximum distinct route+method series before new series are dropped.
 * This is a second-layer guard: primary guard is the allowlist which
 * collapses arbitrary user-controlled values to "/other".
 * Set to accommodate all legitimate route×method combinations (ALLOWED_ROUTES × ALLOWED_METHODS)
 * while still bounding explosion if the allowlist is misconfigured.
 */
export const MAX_CARDINALITY = 200;

const decisionOutcomeCounts = new Map<DecisionOutcome, number>();
const stellarSubmitResultCounts = new Map<StellarSubmitResult, number>();

type MetricBucket = {
  route: string;
  method: string;
  totalCount: number;
  errorCount: number;
  totalDurationMs: number;
  durationsMs: number[];
  lastStatusCode: number;
  lastSeenAt: string;
};

const buckets = new Map<MetricKey, MetricBucket>();
const MAX_DURATIONS = 500;

const WALLET_PATTERN = /G[A-Z2-7]{55}/;
const FREE_TEXT_PATTERN = /[\s\n\r\t"'`]/;

export function normalizeRoute(route: string): string {
  if (!route || typeof route !== "string") {
    return "/other";
  }
  // Strip query string and hash fragment – those can contain free-text / wallet data
  let normalized = route.trim().split("?")[0].split("#")[0] ?? "";
  // Remove trailing slash (except root)
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  // Drop overly long values (likely free-text injection)
  if (normalized.length === 0 || normalized.length > 128) {
    return "/other";
  }
  // Drop values containing Stellar wallet addresses
  if (WALLET_PATTERN.test(normalized)) {
    return "/other";
  }
  // Drop values containing whitespace/quotes (free-text)
  if (FREE_TEXT_PATTERN.test(normalized)) {
    return "/other";
  }
  // Only allow explicitly listed routes; everything else collapses to /other
  if (ALLOWED_ROUTES.has(normalized)) {
    return normalized;
  }
  return "/other";
}

export function normalizeMethod(method: string): string {
  if (!method || typeof method !== "string") {
    return "UNKNOWN";
  }
  const upper = method.trim().toUpperCase();
  if (ALLOWED_METHODS.has(upper)) {
    return upper;
  }
  return "UNKNOWN";
}

export function escapePrometheusLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function keyOf(route: string, method: string): MetricKey {
  return `${method.toUpperCase()}:${route}`;
}

function percentile(values: number[], p: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

export function recordApiMetric(input: {
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
}) {
  const sanitizedRoute = normalizeRoute(input.route);
  const sanitizedMethod = normalizeMethod(input.method);
  const key = keyOf(sanitizedRoute, sanitizedMethod);

  // Cardinality guard: drop new series once MAX_CARDINALITY is reached
  if (!buckets.has(key) && buckets.size >= MAX_CARDINALITY) {
    return;
  }

  const current = buckets.get(key) ?? {
    route: sanitizedRoute,
    method: sanitizedMethod,
    totalCount: 0,
    errorCount: 0,
    totalDurationMs: 0,
    durationsMs: [],
    lastStatusCode: 0,
    lastSeenAt: new Date().toISOString(),
  };

  current.totalCount += 1;
  current.totalDurationMs += input.durationMs;
  current.lastStatusCode = input.statusCode;
  current.lastSeenAt = new Date().toISOString();

  if (input.statusCode >= 400) {
    current.errorCount += 1;
  }

  current.durationsMs.push(input.durationMs);
  if (current.durationsMs.length > MAX_DURATIONS) {
    current.durationsMs.splice(0, current.durationsMs.length - MAX_DURATIONS);
  }

  buckets.set(key, current);
}

export function getMetricsSnapshot() {
  const byRoute = Array.from(buckets.values()).map((bucket) => {
    const avgDurationMs = bucket.totalCount > 0 ? bucket.totalDurationMs / bucket.totalCount : 0;
    const p95DurationMs = percentile(bucket.durationsMs, 95);
    const errorRate = bucket.totalCount > 0 ? bucket.errorCount / bucket.totalCount : 0;

    return {
      route: bucket.route,
      method: bucket.method,
      totalCount: bucket.totalCount,
      errorCount: bucket.errorCount,
      errorRate,
      avgDurationMs,
      p95DurationMs,
      lastStatusCode: bucket.lastStatusCode,
      lastSeenAt: bucket.lastSeenAt,
    };
  });

  const totals = byRoute.reduce(
    (accumulator, current) => {
      accumulator.totalCount += current.totalCount;
      accumulator.errorCount += current.errorCount;
      return accumulator;
    },
    { totalCount: 0, errorCount: 0 }
  );

  return {
    service: "fortexa",
    timestamp: new Date().toISOString(),
    totals: {
      ...totals,
      errorRate: totals.totalCount > 0 ? totals.errorCount / totals.totalCount : 0,
    },
    routes: byRoute,
  };
}

export function toPrometheusText() {
  const snapshot = getMetricsSnapshot();
  const lines: string[] = [];

  lines.push("# HELP fortexa_requests_total Total API requests by route/method");
  lines.push("# TYPE fortexa_requests_total counter");

  for (const route of snapshot.routes) {
    lines.push(
      `fortexa_requests_total{route="${escapePrometheusLabelValue(route.route)}",method="${escapePrometheusLabelValue(route.method)}"} ${route.totalCount}`
    );
  }

  lines.push("# HELP fortexa_request_errors_total Total API errors by route/method");
  lines.push("# TYPE fortexa_request_errors_total counter");

  for (const route of snapshot.routes) {
    lines.push(
      `fortexa_request_errors_total{route="${escapePrometheusLabelValue(route.route)}",method="${escapePrometheusLabelValue(route.method)}"} ${route.errorCount}`
    );
  }

  lines.push("# HELP fortexa_request_duration_ms_p95 P95 request duration in milliseconds");
  lines.push("# TYPE fortexa_request_duration_ms_p95 gauge");

  for (const route of snapshot.routes) {
    lines.push(
      `fortexa_request_duration_ms_p95{route="${escapePrometheusLabelValue(route.route)}",method="${escapePrometheusLabelValue(route.method)}"} ${route.p95DurationMs.toFixed(2)}`
    );
  }

  lines.push("# HELP fortexa_decision_outcomes_total Total decision evaluations by outcome");
  lines.push("# TYPE fortexa_decision_outcomes_total counter");
  for (const [outcome, count] of decisionOutcomeCounts) {
    lines.push(`fortexa_decision_outcomes_total{outcome="${escapePrometheusLabelValue(outcome)}"} ${count}`);
  }

  lines.push("# HELP fortexa_stellar_submit_results_total Total Stellar submission attempts by result");
  lines.push("# TYPE fortexa_stellar_submit_results_total counter");
  for (const [result, count] of stellarSubmitResultCounts) {
    lines.push(`fortexa_stellar_submit_results_total{result="${escapePrometheusLabelValue(result)}"} ${count}`);
  }

  return `${lines.join("\n")}\n`;
}

export function recordDecisionOutcome(outcome: DecisionOutcome) {
  // Only allow low-cardinality allowlisted outcomes; drop free-text/wallet injection
  const normalized = String(outcome).trim().toUpperCase();
  if (!ALLOWED_OUTCOMES.has(normalized as DecisionOutcome)) {
    return;
  }
  const safeOutcome = normalized as DecisionOutcome;
  decisionOutcomeCounts.set(safeOutcome, (decisionOutcomeCounts.get(safeOutcome) ?? 0) + 1);
}

export function recordStellarSubmitResult(result: StellarSubmitResult) {
  if (!ALLOWED_RESULTS.has(result as StellarSubmitResult)) {
    return;
  }
  stellarSubmitResultCounts.set(result as StellarSubmitResult, (stellarSubmitResultCounts.get(result as StellarSubmitResult) ?? 0) + 1);
}

export function resetMetrics() {
  buckets.clear();
  decisionOutcomeCounts.clear();
  stellarSubmitResultCounts.clear();
}

export function getDecisionOutcomeCounts(): ReadonlyMap<DecisionOutcome, number> {
  return decisionOutcomeCounts;
}

export function getStellarSubmitResultCounts(): ReadonlyMap<StellarSubmitResult, number> {
  return stellarSubmitResultCounts;
}
