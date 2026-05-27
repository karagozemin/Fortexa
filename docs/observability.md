# Fortexa Observability Guide

Fortexa exposes lightweight, Prometheus-compatible metrics for every API route. This guide covers how to scrape them, sample PromQL for common dashboards/alerts, and where to look inside the app.

> Metrics implementation: [`src/lib/observability/metrics.ts`](../src/lib/observability/metrics.ts)

---

## Endpoints

| Endpoint | Purpose | Auth |
| --- | --- | --- |
| `GET /api/health` | Liveness check | None |
| `GET /api/metrics` | JSON snapshot of all route buckets | Operator session cookie |
| `GET /api/metrics?format=prometheus` | Prometheus text exposition (v0.0.4) | Operator session cookie |

The `/ops` page in the app renders the same data for human operators.

### Auth

Both `/api/metrics` variants require an **operator** session. Fortexa uses an HMAC-signed cookie named `fortexa_session`, set when a wallet signs in via `POST /api/auth/login`.

For local development (when `FORTEXA_OPERATOR_WALLETS` is unset), any valid-format Stellar public key resolves to the operator role. In production, set `FORTEXA_OPERATOR_WALLETS` to the comma-separated list of operator wallet keys.

---

## Exported metrics

All series are labeled by `route` (Next.js route path, e.g. `/api/decision`) and `method` (uppercase HTTP verb).

| Metric | Type | Description |
| --- | --- | --- |
| `fortexa_requests_total` | counter | Total API requests by route/method |
| `fortexa_request_errors_total` | counter | Requests that returned HTTP >= 400 |
| `fortexa_request_duration_ms_p95` | gauge | Rolling p95 latency in milliseconds (last 500 samples per bucket) |

Sample output:

```
# HELP fortexa_requests_total Total API requests by route/method
# TYPE fortexa_requests_total counter
fortexa_requests_total{route="/api/health",method="GET"} 5
fortexa_requests_total{route="/api/decision",method="POST"} 2
# HELP fortexa_request_errors_total Total API errors by route/method
# TYPE fortexa_request_errors_total counter
fortexa_request_errors_total{route="/api/health",method="GET"} 0
# HELP fortexa_request_duration_ms_p95 P95 request duration in milliseconds
# TYPE fortexa_request_duration_ms_p95 gauge
fortexa_request_duration_ms_p95{route="/api/health",method="GET"} 1.00
```

> Note: `p95` is exported as a gauge computed from an in-memory ring buffer (last 500 observations per route), not as a Prometheus histogram. It is intended for at-a-glance dashboards, not high-fidelity SLO math.

---

## Prometheus scrape config

Fortexa's metrics endpoint is cookie-protected. Use Prometheus' `authorization` or `cookies` support via the `Cookie` header to authenticate.

```yaml
scrape_configs:
  - job_name: fortexa
    metrics_path: /api/metrics
    params:
      format: [prometheus]
    scheme: https
    scrape_interval: 30s
    scrape_timeout: 10s
    static_configs:
      - targets:
          - fortexa.your-domain.example
    # Operator session cookie minted from POST /api/auth/login
    # Store the cookie value in a file and reference it here.
    authorization:
      type: ""
    # Prometheus does not natively support cookie auth headers; use a
    # request header instead:
    # (Prometheus 2.26+ supports `http_headers`)
    http_headers:
      Cookie:
        values:
          - "fortexa_session=<paste-signed-token-here>"
```

If your environment does not allow long-lived cookies, an alternative is to put a small auth-injecting proxy (e.g. nginx, Envoy, or a sidecar) in front of Fortexa that adds the `Cookie` header on each request.

### Local verification

```bash
# 1. Log in (any valid-format Stellar pubkey works when no operator allowlist is set)
curl -s -c /tmp/fortexa-cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"publicKey":"GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR"}' \
  http://localhost:3001/api/auth/login

# 2. Scrape
curl -b /tmp/fortexa-cookies.txt \
  "http://localhost:3001/api/metrics?format=prometheus"
```

---

## Sample PromQL

### Request rate per route (requests/sec, 5-minute window)

```promql
sum by (route) (rate(fortexa_requests_total[5m]))
```

### Error rate per route (fraction, 5-minute window)

```promql
sum by (route) (rate(fortexa_request_errors_total[5m]))
  /
sum by (route) (rate(fortexa_requests_total[5m]))
```

### Overall error rate

```promql
sum(rate(fortexa_request_errors_total[5m]))
  /
sum(rate(fortexa_requests_total[5m]))
```

### p95 latency per route (ms)

```promql
max by (route) (fortexa_request_duration_ms_p95)
```

### Top 5 noisiest routes by request count (last 1h)

```promql
topk(5, sum by (route) (increase(fortexa_requests_total[1h])))
```

### Example alert — sustained elevated error rate

```yaml
groups:
  - name: fortexa
    rules:
      - alert: FortexaHighErrorRate
        expr: |
          (
            sum by (route) (rate(fortexa_request_errors_total[5m]))
            /
            sum by (route) (rate(fortexa_requests_total[5m]))
          ) > 0.05
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Fortexa error rate >5% on {{ $labels.route }}"
```

---

## Grafana

A minimal importable dashboard with the three panels above lives at
[`docs/grafana/fortexa-minimal.json`](grafana/fortexa-minimal.json).

To import:

1. In Grafana, go to **Dashboards → New → Import**.
2. Upload `fortexa-minimal.json` (or paste its contents).
3. When prompted, select your Fortexa Prometheus datasource for the `DS_PROMETHEUS` variable.

Panels:

- **Request rate by route** — `sum by (route) (rate(fortexa_requests_total[5m]))`
- **Error rate by route** — error counter / request counter, with 5% / 10% threshold lines
- **p95 latency by route** — `max by (route) (fortexa_request_duration_ms_p95)`

---

## In-app dashboard

For operators who don't want to wire up Prometheus, the `/ops` page renders the same snapshot:

- Service health (from `/api/health`)
- Total requests / error rate / signed tx count
- Top routes and rolling trend

`/ops` is gated by operator session, same as `/api/metrics`.

---

## Notes & caveats

- **In-memory only.** All buckets live in the Node process. Restarting the server resets counters. For long-term retention, scrape into Prometheus.
- **Per-instance.** If Fortexa is horizontally scaled, each replica exposes its own counters. Aggregate with `sum by (route)` in PromQL.
- **No histogram.** p95 is a gauge derived from a 500-sample ring buffer, not a true Prometheus histogram. Don't use it for cross-instance percentile aggregation.
- **Local vs deployed auth.** Locally, no allowlist means any pubkey works. In production, set `FORTEXA_OPERATOR_WALLETS` to restrict.
