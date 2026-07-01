# Fortexa

<p align="center">
  <img src="public/fortexa-logo.jpeg" alt="Fortexa logo" width="200" />
</p>

<p align="center"><strong>Policy-Controlled Payment Firewall for Autonomous Agent Actions on Stellar</strong></p>

Fortexa is a **policy-controlled payment firewall for autonomous agent actions on Stellar**.
It sits between agent intent and economic execution, applies governance/risk checks, and keeps an auditable decision trail.

This document reflects the **current implementation** in this repository.

See [docs/SCF_TRANCHE_PLAN.md](docs/SCF_TRANCHE_PLAN.md) for the Stellar Community Fund (SCF) funding tranches and roadmap alignment.

---

## 1) ⚠️ Why This Matters

Agentic systems can now trigger real payments. That creates a new risk layer: high-speed model decisions can become high-impact economic actions.

Fortexa adds a control plane between intent and money movement:

- Policy checks before execution
- Risk scoring on suspicious behavior
- Human-approval gate for sensitive cases
- Wallet-native signed XDR flow
- Auditable evidence trail for every decision

In short: Fortexa is the safety layer for agentic payments.

---

## 2) 🚀 Jury Demo Flow (Fast Path)

If you only read one section, read this:

1. **Login with wallet** on `/login`.
2. **Evaluate action** in `/console`.
3. Receive decision: **`BLOCK` / `REQUIRE_APPROVAL` / `WARN` / `APPROVE`**.
4. For allowed flows, **build unsigned XDR → sign in wallet → submit signed XDR**.
5. Verify outcome with **Explorer link** and inspect evidence in `/activity` and `/ops`.

### ✅ Reviewer Checklist: Wallet-Bound Payment Flow

The core security premise of Fortexa is that it **does not hold private keys or perform server-side signing.**
This end-to-end flow validates that design:

| Step | UI / Route | Source / Logic | Expected Signal |
|---|---|---|---|
| **1. Login** | `/login` | [`POST /api/auth/login`](src/app/api/auth/login/route.ts) <br> [`src/components/login-form.tsx`](src/components/login-form.tsx) | **Success**: Freighter challenge signed, session issued.<br>**Failure**: Signature mismatch, unauthorized wallet. |
| **2. Decision** | `/console` | [`POST /api/decision`](src/app/api/decision/route.ts) <br> [`src/components/decision-console.tsx`](src/components/decision-console.tsx) | **Success**: Returns `APPROVE` or `WARN` with a fixed payment quote.<br>**Failure**: Returns `BLOCK` (no quote). |
| **3. Quote Lock** | `/console` | [`POST /api/stellar/build-payment`](src/app/api/stellar/build-payment/route.ts) | **Success**: Build request perfectly matches the approved audit entry quote.<br>**Failure**: Server rejects tampered destination, amount, or memo with `403`. |
| **4. Unsigned XDR Build** | `/console` | [`POST /api/stellar/build-payment`](src/app/api/stellar/build-payment/route.ts) | **Success**: Server returns valid unsigned XDR envelope.<br>**Failure**: Network timeout, missing parameters. |
| **5. Wallet Signing** | `/console` | `signTransaction` inside <br> [`src/components/decision-console.tsx`](src/components/decision-console.tsx) | **Success**: Freighter popup appears, user signs, UI holds signed XDR.<br>**Failure**: User rejects in wallet. |
| **6. Signed Submit** | `/console` | [`POST /api/stellar/submit-signed`](src/app/api/stellar/submit-signed/route.ts) | **Success**: Broadcasts successfully to Stellar Testnet (200 OK).<br>**Failure**: Horizon error (`tx_bad_seq`, `op_underfunded`). |
| **7. Explorer Link** | `/console` | [`src/components/decision-console.tsx`](src/components/decision-console.tsx) | **Success**: Clickable link to Stellar Expert confirming hash matches. |
| **8. Audit Evidence** | `/activity`<br>`/ops` | [`GET /api/audit`](src/app/api/audit/route.ts) <br> [`src/app/activity/page.tsx`](src/app/activity/page.tsx) | **Success**: Immutable record of the original decision and execution hash. |

*(Note: Fortexa is currently built for testnet validation. Mainnet readiness requires further risk intel integrations.)*

---

## 3) 🧭 Current Product Model

Fortexa currently runs with a strict wallet-bound model:

1. User logs in with wallet (`/login`).
2. Session is created with role (`operator` / `viewer`).
3. Session wallet is bound as execution source.
4. Actions are evaluated by policy + security engine.
5. Approved/warned decisions can proceed to signed-XDR payment flow.
6. Decision/audit evidence is stored and visible in `/activity` and `/ops`.

---

## 4) 🔐 Auth and Access Control

### 4.1 Wallet-only Login

Fortexa uses a challenge-signature login flow:

1. Client requests a one-time login challenge via `POST /api/auth/challenge` with the wallet public key (`G...`).
2. The server returns a short-lived challenge message bound to that wallet.
3. The wallet signs the challenge message (SEP-53 / Freighter `signMessage`).
4. Client posts `publicKey`, `challengeId`, and `signature` to `POST /api/auth/login`.
5. The server verifies the signature, enforces one-time challenge use + expiry, then issues `fortexa_session`.

Role is still resolved via allowlists:

- `FORTEXA_OPERATOR_WALLETS`
- `FORTEXA_VIEWER_WALLETS`

If both allowlists are empty, current behavior falls back to `operator` role for any valid wallet (recommended only for local/dev).

Session cookie: `fortexa_session` (HMAC-signed).

Challenge TTL: `FORTEXA_AUTH_CHALLENGE_TTL_SECONDS` (default `300`).

### 4.2 Role Permissions

- `operator`: full decision/policy/payment flow
- `viewer`: read-only experience on sensitive execution paths

### 4.3 Login Hardening

- Rate limiting
- Brute-force lockout (`FORTEXA_AUTH_MAX_ATTEMPTS`, `FORTEXA_AUTH_LOCK_MINUTES`)

> Note: MFA is removed from current implementation.

---

## 5) 👛 Wallet and Signing Model (Current)

Fortexa currently does **not perform server-side signing or private-key custody**.

- Session is wallet-bound at login.
- Execution source wallet is derived from session identity.
- Session wallet mappings expire automatically after 24 hours. Expired sessions will receive a `401 Unauthorized` response on protected endpoints.
- Operators can forcefully revoke a compromised or stale session mapping via `DELETE /api/auth/wallet/revoke`. This deterministically removes the mapping from storage, requiring the user to reconnect their wallet.
- Manual arbitrary wallet assignment in UI is removed.
- `/api/stellar/balance` auto-syncs missing wallet mapping from session when possible.

---

## 6) ⚙️ Decision and Payment Flow

### 6.1 Decisioning

- Policy engine: `src/lib/policy/engine.ts`
- Security analyzer: `src/lib/security/analyzer.ts`
- Decision engine: `src/lib/decision/engine.ts`

Decision outcomes:
- `BLOCK`
- `REQUIRE_APPROVAL`
- `WARN`
- `APPROVE`

`Human Approve & Re-run` applies only when prior result is `REQUIRE_APPROVAL`.

### 6.1a Policy Simulation (Pre-Save Safety Check)

Before committing a policy change, operators can dry-run the unsaved draft from the Policy editor (**Run simulation**). The draft is evaluated against the seeded demo scenarios — and, optionally, a small recent-audit sample — and the result shows each action's `current → proposed` decision so risky edits surface before they go live.

Simulation is strictly read-only: it never saves the policy and never consumes usage. Saving still happens only through `POST /api/policy`. See `src/lib/decision/simulate.ts` and `POST /api/policy/simulate`.

> **Reporting API failures:** Include the `x-request-id` header value from the response (or the `requestId` field from server-side logs) when filing a bug report. See [docs/observability.md](docs/observability.md#reporting-api-failures) for details.

### 6.2 Signed XDR Payment Path

1. Evaluate action in `/console` with a **payment quote** (`paymentQuoteInput`: destination, optional memo, network). On `APPROVE`/`WARN`, Fortexa stores an immutable `paymentQuote` on the audit entry.
2. Build unsigned tx: `POST /api/stellar/build-payment` with `auditEntryId` plus the same destination, amount, asset, memo, and network. The server verifies every field against the authorized quote **before** constructing XDR.
3. `Submit Signed XDR` orchestrates signing/submission path:
   - if signed input is already present → submit directly
   - if unsigned input is present → wallet signing is triggered first, then submit
4. Submit signed tx: `POST /api/stellar/submit-signed`.
5. Explorer URL is returned and shown as clickable link.

#### Quote-to-XDR trust boundary

The policy decision authorizes a fixed payment quote (destination, amount, asset, memo, network). `POST /api/stellar/build-payment` is the enforcement gate: it loads the audit entry by `auditEntryId`, confirms the decision is `APPROVE`/`WARN`, and rejects any request whose fields diverge from the stored quote.

| Condition | HTTP | Response |
|---|---|---|
| Missing/invalid body (`auditEntryId`, schema) | `400` | `Invalid payment build request.` + zod details |
| Unknown audit entry or non-executable decision | `403` | `No authorized payment decision found…` / `Decision 'BLOCK' does not authorize…` |
| Quote older than `FORTEXA_PAYMENT_QUOTE_TTL_SECONDS` (default 300 s) | `403` | `Payment quote has expired. Please re-evaluate the action.` |
| Tampered destination, amount, asset, or memo | `403` | `{ error, field }` naming the mismatched field |
| Valid approved request | `200` | `{ ok: true, xdr, networkPassphrase, … }` |

Client-side UI must pass the same `paymentQuoteInput` at decision time and reuse the returned `auditEntry.id` when building XDR. Mutating any authorized field after approval cannot produce a valid unsigned transaction.

**Idempotent retries:** `POST /api/stellar/submit-signed` accepts an optional idempotency key, supplied either as an `Idempotency-Key` request header or an `idempotencyKey` body field (the header wins if both are present). Results are stored per authenticated user + key + signed-XDR hash. Replaying the same key with the same signed XDR returns the original result (`200`, with header `Idempotency-Replayed: true`) without resubmitting to Horizon. Reusing the same key with a different signed XDR returns `409 Conflict`. Omitting the key preserves the original submit-on-every-request behavior. Keys must be 8–255 characters.

Additional behavior:
- XDR build timeout configured to 180 seconds.
- Submit errors include Horizon result codes when available.

---

## 7) 📜 Audit and Evidence

- Decisions are appended to audit store at evaluation time.
- `/activity` reads entries by authenticated session user id.
- Export endpoint supports `mine` and `all` scopes in JSON/CSV.

### Timestamp timezone

All audit timestamps are recorded and exported in **UTC** (ISO 8601 format with a `Z` suffix, e.g. `2025-06-01T12:00:00.000Z`). This applies to both JSON and CSV exports — the `timestamp` column in CSV output carries the raw UTC string with no local-time conversion. The `from`/`to` query parameters on the export endpoint are also compared against these UTC timestamps, so any filter dates should be expressed in UTC.

### Hash chain integrity

Every new audit entry is linked into a tamper-evident SHA-256 hash chain:

| Field | Description |
|---|---|
| `previousHash` | `entryHash` of the immediately preceding entry, or `0000…0000` (64 zeroes) for the first hashed entry. |
| `entryHash` | SHA-256 of the entry's canonical fields (`id`, `timestamp`, `action`, `decision`, `explanation`, `triggeredPolicies`, `riskFindings`, `stellarTxHash`, `previousHash`). Object keys are sorted before hashing so DB-stored and file-stored entries produce identical digests. |

Both fields are included in JSON exports. CSV exports add `entryHash` and `previousHash` columns.

Verification helper: `verifyHashChain(entries)` in `src/lib/audit/hash-chain.ts` — returns `{ valid: true }` for an untouched log and `{ valid: false, reason }` when it detects a modified, deleted, or reordered entry.

Entries written before this feature was introduced carry no hash fields and are treated as **legacy** entries; they do not break verification of newer hashed entries.

#### CLI verifier

An exported JSON audit file can be verified outside the running application:

```bash
npm run verify:audit -- path/to/export.json
```

The script reads the JSON export, extracts the entries (handles `scope=mine` and `scope=all` formats), and runs the same `verifyHashChain` logic that the library uses. Exit code:

| Exit code | Meaning |
|---|---|
| `0` | All entries verified successfully |
| `1` | Chain integrity check failed (see stdout for details) |
| `2` | Usage error or file not readable |

Usage: `tsx scripts/verify-audit-export.ts <file>`

---

## 8) 🛠️ Local Setup

### Requirements
- Node.js 20+
- npm 10+

### Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open: `http://localhost:3000`

### Resetting Local Demo State

To clean up local developer state safely, use the built-in reset utility (`scripts/reset-local-demo-state.ts`). The script is strictly for local environments and enforces guardrails to prevent accidental destruction of non-local data.

#### Guardrails

- **Local Database Check**: Inspects `DATABASE_URL` and blocks execution if the hostname is not `localhost`, `127.0.0.1`, `::1`, or a local UNIX socket.
- **Local Redis Check**: Skips Redis cleanup entirely when `REDIS_URL` points to a non-local host.
- **Explicit Confirmation**: Runs in dry-run mode unless **both** `FORTEXA_ALLOW_LOCAL_RESET=true` (env var) and `--yes` (CLI flag) are provided together.

#### Usage

* **Dry-Run (Default)** — preview what would be cleared without touching any data:
  ```bash
  npm run demo:reset
  ```
  *(or `npx tsx scripts/reset-local-demo-state.ts`)*

* **Apply Reset** — execute once both guardrails are satisfied:
  ```bash
  FORTEXA_ALLOW_LOCAL_RESET=true npm run demo:reset -- --yes
  ```
  *(or `FORTEXA_ALLOW_LOCAL_RESET=true npx tsx scripts/reset-local-demo-state.ts --yes`)*

#### What Gets Cleared

**JSON store files** (inside `FORTEXA_STORE_DIR`, default `.fortexa/`):

| File | Contents |
|---|---|
| `audit.json` | Audit log entries |
| `policy.json` | Active policy configuration |
| `policy-history.json` | Policy change history |
| `submit-idempotency.json` | Payment idempotency cache |
| `wallets.json` | Wallet registrations |
| `FORTEXA_SHARED_STATE_PATH` | Shared-state file (if configured) |

**Database tables** (only when `DATABASE_URL` is set to a local host):

| Table | Contents |
|---|---|
| `fortexa_wallets` | Wallet registrations |
| `fortexa_audit_entries` | Audit log entries |
| `fortexa_usage` | Usage tracking records |
| `fortexa_policy_state` | Active policy state |
| `fortexa_policy_history` | Policy change history |
| `fortexa_submit_idempotency` | Payment idempotency records |

Tables are truncated with `RESTART IDENTITY CASCADE`.

**Redis keys** (only when `REDIS_URL` points to a local host):
- All keys matching `fortexa:*` are deleted.

#### What Gets Re-seeded

After clearing, the script re-inserts the **default policy configuration at version 1** into both `fortexa_policy_state` and `fortexa_policy_history`. The app starts in a known, valid policy state immediately — no manual re-seed required.

#### What Is NOT Cleared

- `.env.local` and all environment variables
- Database schema and migrations
- `node_modules` and build artifacts
- Any files outside `FORTEXA_STORE_DIR`

#### Recommended Workflow

```bash
# 1. Preview what will be affected (safe — no changes made)
npm run demo:reset

# 2. Apply the reset
FORTEXA_ALLOW_LOCAL_RESET=true npm run demo:reset -- --yes

# 3. Optionally reload fresh demo scenarios
npm run demo:scenarios

# 4. Restart the dev server — default state is regenerated on startup
npm run dev
```

---

## 9) 🌍 Environment Variables

All configuration is documented in [`.env.example`](.env.example). Copy it to `.env.local` and fill in the values you need:

```bash
cp .env.example .env.local
```

The file covers every variable used by the app, organized into:

| Category | Variables |
|---|---|
| **Stellar Network** | `STELLAR_HORIZON_URL`, `STELLAR_NETWORK_PASSPHRASE`, `NEXT_PUBLIC_STELLAR_DESTINATION`, `FORTEXA_PAYMENT_QUOTE_TTL_SECONDS` |
| **Auth** | `FORTEXA_AUTH_SECRET`, `FORTEXA_OPERATOR_WALLETS`, `FORTEXA_VIEWER_WALLETS`, `FORTEXA_AUTH_CHALLENGE_TTL_SECONDS`, `FORTEXA_AUTH_MAX_ATTEMPTS`, `FORTEXA_AUTH_LOCK_MINUTES` |
| **Storage** | `DATABASE_URL`, `DATABASE_SSL`, `FORTEXA_STORE_DIR` |
| **Shared State** | `FORTEXA_SHARED_STATE_PATH`, `REDIS_URL` |
| **Idempotency** | `FORTEXA_IDEMPOTENCY_RETENTION_DAYS` |
| **Optional Integrations** | `GROQ_API_KEY`, `GROQ_MODEL`, `FORTEXA_BLOCKLIST_URL` |
| **Request Handling** | `FORTEXA_JSON_BODY_MAX_BYTES` |
| **Dev Utilities** | `FORTEXA_ALLOW_LOCAL_RESET` |

> [!IMPORTANT]
> **Stellar Network Configuration Pairing:**
> `STELLAR_HORIZON_URL` and `STELLAR_NETWORK_PASSPHRASE` are paired settings and must always be configured together. When switching between local development and Stellar testnet, ensure both values are updated in tandem. Mismatched values can cause confusing failures (e.g., submitting transactions to one Horizon instance while signing for another network). In production, ensure both are set to the correct production values.

---

## 10) ▶️ Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm test
npm run test:watch
npm run demo:scenarios
npm run db:migrate
```

### Running the policy pack regression suite

The investor-facing scenario pack lives in `src/lib/scenarios/seed.ts` and its regression suite in `src/lib/scenarios/scenario-pack.test.ts`.

Run the full scenario pack:

```bash
npm test -- src/lib/scenarios/scenario-pack.test.ts
```

Run the standalone demo runner (prints expected vs actual for every seeded scenario):

```bash
npm run demo:scenarios
```

---

## 11) 🔌 API Surface (Reference)

JSON `POST` routes that accept request bodies enforce a shared size limit before parsing (default **64 KiB**, override with `FORTEXA_JSON_BODY_MAX_BYTES`). Oversized payloads receive HTTP **413** with a clear error message; malformed but small JSON still returns the route's normal validation error.

### Auth
- `POST /api/auth/challenge`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `POST /api/auth/refresh`
- `DELETE /api/auth/wallet/revoke` (`operator`) — revokes session wallet mapping

### Policy
- `GET /api/policy`
- `POST /api/policy` (`operator`)
- `POST /api/policy/simulate` (`operator`) — read-only pre-save simulation
- `GET /api/policy/history` (`operator`)
- `POST /api/policy/rollback` (`operator`)

### Decision / Planning
- `POST /api/decision` (`operator`)
- `POST /api/agent/plan` (`operator`, Groq-backed)

### Audit / Observability
- `GET /api/audit`
- `GET /api/audit/export?format=json|csv&scope=mine|all&from=<ISO8601>&to=<ISO8601>&decision=APPROVE|WARN|REQUIRE_APPROVAL|BLOCK&domain=<string>&actionId=<string>`
  - **Filters:** `from` / `to` (ISO 8601 date), `decision`, `domain`, `actionId` — all optional
  - **Scope:** `mine` (own entries) or `all` (operator only)
  - **Examples:**
    - `GET /api/audit/export?format=csv&scope=mine&from=2025-06-01T00:00:00Z&to=2025-06-30T23:59:59Z`
    - `GET /api/audit/export?format=json&scope=all&decision=BLOCK&domain=malicious.example.com`
    - `GET /api/audit/export?format=json&scope=mine&actionId=evt_abc123`
- `GET /api/health`
- `GET /api/metrics` (`?format=prometheus`)

### Stellar
- `GET /api/stellar/balance`
- `POST /api/stellar/setup` (session-wallet bootstrap/sync helper; not manual wallet linking)
- `POST /api/stellar/build-payment`
- `POST /api/stellar/submit-signed` (supports `Idempotency-Key` header/body for safe UI retries)
- `POST /api/stellar/pay` (legacy disabled)
- `POST /api/stellar/fund` (removed behavior, returns `410`)

> **Note:** Newly created Stellar testnet wallets start with zero balance. Unfunded wallets cannot perform balance queries, payment flows, or other wallet operations. Before testing, fund the wallet using the Stellar testnet friendbot (`GET https://friendbot.stellar.org?addr=YOUR_PUBLIC_KEY`) or the in‑app `/api/stellar/setup` endpoint. This applies only to the testnet; production wallets are funded via standard Stellar distribution channels.

---

## 12) 🗺️ Pages

- `/` → Overview dashboard
- `/login` → Wallet-only authentication (Connect Wallet)
- `/wallet` → Session wallet status and balance
- `/console` → Decisioning + payment execution console
- `/policies` → Policy editor, history, rollback
- `/scenarios` → Scenario gallery
- `/activity` → Audit trail timeline
- `/ops` → Operations/telemetry dashboard

---

## 13) 📈 Ops / Observability (Appendix)

- Health endpoint: `GET /api/health` — returns `blocklist` object with `configured`, `lastRefreshAt`, `domainCount`, `lastError`
- Metrics endpoint: `GET /api/metrics` + Prometheus format
- `/ops` dashboard shows:
  - service health
  - total requests
  - error rate
  - signed tx count
  - blocklist feed health (configured, domain count, last refresh, errors)
  - top routes + rolling trend

Ops dashboard initial load is optimized so core telemetry renders first; slow TX-count fetch no longer blocks first paint.

See [docs/observability.md](docs/observability.md) for the Prometheus scrape config, sample PromQL (request rate, error rate, p95 latency), and an example alert rule.

---

## 14) 💾 Persistence (Appendix)

### DB-first with File Fallback

Stores include:
- `audit-store`
- `policy-store`
- `user-wallet-store`
- `submit-idempotency-store`

If `DATABASE_URL` is available and healthy, Postgres is used.
Otherwise Fortexa falls back to local JSON files:
- local/dev default: `.fortexa/*.json`
- Vercel default: `/tmp/fortexa/*.json`

Optional overrides:
- `FORTEXA_STORE_DIR` to set file-store directory explicitly
- `FORTEXA_SHARED_STATE_PATH` for shared lockout/rate-limit state file path
  - use an absolute path on Vercel (example: `/tmp/fortexa/shared-security-state.json`)
- `REDIS_URL` for multi-instance deployments (e.g. Vercel)
  - uses a Redis-backed adapter with automatic, transparent fallback to the file store if Redis is unreachable or unconfigured.

### Versioned Migrations

- Migrations: `src/lib/storage/migrations.ts`
- Runner: `src/lib/storage/db.ts`
- Tracking table: `fortexa_schema_migrations`
- Manual run: `npm run db:migrate`

---

## 15) 🧱 Stack (Appendix)

- **Framework:** Next.js App Router (`next@16`)
- **Language:** TypeScript
- **UI:** Tailwind CSS + custom UI primitives
- **Validation:** `zod`
- **Charts:** `recharts`
- **Stellar:** `@stellar/stellar-sdk`, optional `@stellar/freighter-api`
- **Database:** `pg` (optional Postgres, file fallback enabled)
- **Tests:** Vitest

---

## 16) 🛡️ Security Headers

Fortexa applies baseline security headers to every response (pages and API routes) via `src/middleware.ts`.

| Header | Value | Rationale |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing — browsers trust the declared `Content-Type` without guessing. |
| `X-Frame-Options` | `DENY` | Blocks the app from being embedded in `<frame>`, `<iframe>`, or `<object>` — prevents clickjacking. |
| `Content-Security-Policy` | `default-src 'self'`; + per-resource directives | Restricts resource loading to the origin. Inlines styles are allowed (required by `next/font` and Tailwind). In **development** `script-src` also allows `'unsafe-inline'` and `'unsafe-eval'` for Next.js hot-reload; in **production** only `'self'` scripts are permitted. `frame-ancestors 'none'` and `form-action 'self'` provide additional clickjacking and form-redirect protection. `base-uri 'self'` prevents injected `<base>` tag attacks. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disables unused browser capabilities to reduce the attack surface. |

### Development vs. Production

- In `NODE_ENV=development` the CSP `script-src` includes `'unsafe-inline'` and `'unsafe-eval'` because the Next.js dev server injects inline scripts for hot-module reload. The production build strips these, relying on Next.js's hashed/external script strategy.
- All other directives are identical across environments.

These headers are applied by Next.js Middleware (`src/middleware.ts`), which runs on every request matching `/((?!_next/static|_next/image|favicon.ico|icon.jpg).*)`. The helper function `buildSecurityHeaders()` in `src/lib/security/headers.ts` constructs the header map and is unit-tested independently.

---

## 17) 🧪 Known Limitations (Current)

1. Shared security state supports Redis distributed locking, but defaults to file-based for local development.
2. Risk scoring remains heuristic-heavy (no external threat-intel integration).
3. Stellar workflow is testnet-oriented.
4. Server-side signing remains intentionally disabled.
5. Full end-to-end automated coverage for the complete decision-to-payment lifecycle is still limited.

Fortexa is intentionally optimized for hackathon clarity and wallet-native control, not full production deployment.

---

## 17) 🛡️ Decision Explanation Snapshot Tests

Reviewer-facing explanation text is guarded by snapshot tests to ensure transparency and prevent accidental explanation drift across changes.

**How to update snapshots:**
```bash
npm run test -- src/lib/decision/engine.scenarios.test.ts --updateSnapshot
```

**Files:**
- `src/lib/decision/engine.scenarios.test.ts` - Snapshot tests for decision explanations
- `src/lib/decision/engine.test.ts` - Updated summary file referencing the snapshots

**Covered decision types:**
- **APPROVE** - Safe research payment (human-readable approval message)
- **BLOCK** - Malicious endpoint blocked by domain policy
- **WARN** - Typosquat domain risk detected (caution warning)
- **REQUIRE_APPROVAL** - Over-budget transfer requiring manual approval

These snapshots make policy decision transparency reproducible for reviewers and protect against accidental explanation drift.

---

## 18) ❓ Troubleshooting Payment Failures

Common Stellar Horizon failures during the signed payment flow:

- **`tx_bad_seq`**: The transaction sequence number is incorrect. Wait for pending transactions to clear or refresh your wallet state.
- **`tx_insufficient_fee`**: The provided fee is below the current network minimum. Increase the base fee.
- **`op_no_destination`**: The destination account does not exist on the network. Verify the destination address.
- **`op_underfunded`**: Your source wallet lacks the XLM necessary to complete the payment and satisfy the network base reserve.

---

## 19) 🛣️ Practical Next Steps

- Add stronger risk intelligence + anomaly detection.
- Expand end-to-end payment verification and automated lifecycle tests.

---

## 20) 📄 License

MIT (see `package.json`).## Policy Import/Export

The policy editor supports importing and exporting policies as JSON files, enabling backup, restore, and policy migration workflows.

### Export a Policy

1. Navigate to the **Policy Engine Rules** page (`/ops/policies`)
2. Scroll to **Policy Import / Export** section
3. Click **Export Policy** button
4. A JSON file will download (e.g., `policy-v1719741123.json`) containing the complete active policy

**Who can export:** All users (operators and viewers)

### Import a Policy

Operators can import a new policy with automatic validation and preview:

1. Click **Import Policy** button in the **Policy Import / Export** section
2. Select a policy JSON file from your computer
3. The system validates the JSON against the policy schema
4. If valid, a **Review Changes** dialog appears showing:
   - Summary of additions, removals, and modifications
   - Detailed changes grouped by category:
     - **Caps & Thresholds** — Per-transaction cap, daily cap, max tool calls, risk threshold
     - **Allowed/Blocked Domains** — Domain whitelist and blacklist changes
     - **Allowed/Blocked Tools** — Tool access whitelist and blacklist changes
   - Optional raw JSON viewer for advanced inspection
5. Review the changes carefully, then click **Import & Save** to apply the policy
6. The policy is updated and a new version is created in the history

**Who can import:** Operators only. Viewers cannot import or save policies.

### Policy JSON Format

A valid policy JSON includes:

```json
{
  "allowedDomains": ["api.example.com", "data.example.com"],
  "blockedDomains": ["malicious.com"],
  "allowedTools": ["research-pro", "data-analyzer"],
  "blockedTools": ["shadow-shell"],
  "perTxCapXLM": 100,
  "dailyCapXLM": 500,
  "maxToolCallsPerDay": 10,
  "riskThreshold": 75,
  "allowedHours": { "start": 6, "end": 23 }
}
```

**Field Requirements:**
- `allowedDomains`, `blockedDomains`, `allowedTools`, `blockedTools` — Arrays with minimum 1 item each
- `perTxCapXLM`, `dailyCapXLM` — Positive numbers up to 1,000,000
- `maxToolCallsPerDay` — Positive integer up to 10,000
- `riskThreshold` — Integer between 1 and 100
- `allowedHours` — Optional object with `start` and `end` (0–23)

### Diff Preview

Before saving an imported policy, the system displays a human-readable diff showing:

- ✅ **Unchanged fields** — No visual highlight
- ➕ **Added items** — Green highlight (e.g., new domains or tools)
- ➖ **Removed items** — Red highlight with strikethrough (e.g., deleted domains or tools)
- 🔄 **Modified values** — Amber highlight showing old → new (e.g., cap changes)

This preview ensures operators never accidentally save unintended policy changes.

### Validation & Error Handling

During import, the system validates:

1. **JSON Format** — File must be valid JSON; invalid syntax is rejected immediately
2. **Schema Compliance** — All required fields must be present with correct types and ranges
3. **Data Constraints** — Arrays must have at least 1 item; numeric values must be within limits

If validation fails, an error message displays the specific field and reason without modifying the current policy. The operator can then fix the JSON and retry.

### Viewer Role Limitations

Users with **Viewer role** can:
- ✅ Export the active policy as JSON
- ✅ View policy history and version diffs
- ✅ Review simulation reports

Users with **Viewer role** cannot:
- ❌ Import policies
- ❌ Save policy changes
- ❌ Modify any policy settings

Attempt to import as a viewer will show: *"Viewer role is read-only. Login as operator to import policies."*

### Best Practices

- **Always review the diff preview** before saving imported policies
- **Export before major changes** to create a backup
- **Use a JSON editor** with syntax validation when editing policy files locally
- **Test policies in staging** before deploying to production
- **Validate domains** — Ensure domain names are at least 3 characters
- **Check numeric ranges** — Caps must be positive and within limits
