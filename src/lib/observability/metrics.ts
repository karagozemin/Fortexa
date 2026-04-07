type MetricKey = `${string}:${string}`;

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
  const key = keyOf(input.route, input.method);
  const current = buckets.get(key) ?? {
    route: input.route,
    method: input.method.toUpperCase(),
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
      `fortexa_requests_total{route="${route.route}",method="${route.method}"} ${route.totalCount}`
    );
  }

  lines.push("# HELP fortexa_request_errors_total Total API errors by route/method");
  lines.push("# TYPE fortexa_request_errors_total counter");

  for (const route of snapshot.routes) {
    lines.push(
      `fortexa_request_errors_total{route="${route.route}",method="${route.method}"} ${route.errorCount}`
    );
  }

  lines.push("# HELP fortexa_request_duration_ms_p95 P95 request duration in milliseconds");
  lines.push("# TYPE fortexa_request_duration_ms_p95 gauge");

  for (const route of snapshot.routes) {
    lines.push(
      `fortexa_request_duration_ms_p95{route="${route.route}",method="${route.method}"} ${route.p95DurationMs.toFixed(2)}`
    );
  }

  return `${lines.join("\n")}\n`;
}

export function resetMetrics() {
  buckets.clear();
}
