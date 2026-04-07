# Fortexa

Fortexa is a **policy-controlled payment safety layer for autonomous agents on Stellar**.
It sits between an AI agent and economic execution, enforcing policy, security checks, and auditable decisioning before any payment/action can proceed.

This README is intentionally complete and candid: what exists, how it works, and where the current limitations are.

---

## 1) What Fortexa Does

Fortexa acts like an execution firewall:

1. An agent proposes an action.
2. The policy engine checks governance constraints.
3. The security analyzer computes risk findings and score.
4. The decision engine returns one of: `APPROVE`, `WARN`, `REQUIRE_APPROVAL`, `BLOCK`.
5. The outcome is stored in the audit trail.
6. If allowed, an unsigned Stellar testnet XDR can be built, signed by the wallet owner, then submitted.

---

## 2) Stack

- **Framework:** Next.js App Router (`next@16`)
- **Language:** TypeScript
- **UI:** Tailwind CSS + custom UI primitives
- **Validation:** `zod`
- **Charts:** `recharts`
- **Stellar:** `@stellar/stellar-sdk`, optional Freighter helper
- **Database:** `pg` (optional Postgres with file fallback)
- **Testing:** Vitest

---

## 3) Product Surface

### 3.1 Pages

- `/` → Overview + KPI cards + wallet summary
- `/wallet` → Session wallet status (identity-bound)
- `/policies` → Runtime policy editor + history + rollback
- `/console` → Decision console + AI action generation + XDR flow
- `/scenarios` → Scenario catalog
- `/activity` → Audit timeline
- `/ops` → Operations dashboard (health/metrics trends)
- `/login` → Wallet-only login (role resolved from wallet allowlists)

### 3.2 API Routes

#### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `POST /api/auth/refresh`

#### Policy
- `GET /api/policy`
- `POST /api/policy` (operator)
- `GET /api/policy/history` (operator)
- `POST /api/policy/rollback` (operator)

#### Decision / Planning
- `POST /api/decision` (operator)
- `POST /api/agent/plan` (operator, Groq-backed)

#### Audit / Ops
- `GET /api/audit`
- `GET /api/audit/export?format=json|csv&scope=mine|all`
- `GET /api/health`
- `GET /api/metrics` (`?format=prometheus` supported)

#### Stellar
- `GET /api/stellar/balance`
- `POST /api/stellar/setup`
- `POST /api/stellar/build-payment`
- `POST /api/stellar/submit-signed`
- `POST /api/stellar/pay` (legacy endpoint, intentionally disabled)

---

## 4) Decisioning Internals

### 4.1 Policy Engine (`src/lib/policy/engine.ts`)

Checks include:
- Domain allowlist/blocklist
- Tool allowlist/blocklist
- Per-transaction cap
- Daily cap
- Max tool calls/day
- Allowed hours window

Returns trigger list + policy flags (`hardBlock`, `requireApproval`, `warning`).

### 4.2 Security Analyzer (`src/lib/security/analyzer.ts`)

Heuristic findings include:
- Suspicious domain patterns (`evil`, `drainer`, `phish`)
- High-risk TLDs (`.zip`, `.click`, `.top`, `.ru`)
- Prompt-injection signatures
- Secret-targeting signatures
- High-amount / weak-target indicators

Returns `riskScore` (0–100) and findings.

### 4.3 Decision Engine (`src/lib/decision/engine.ts`)

Current decision rules:
- Hard block or severe finding → `BLOCK`
- Approval-required policy trigger or risk score above threshold → `REQUIRE_APPROVAL`
- Medium warning signal → `WARN`
- Otherwise → `APPROVE`

---

## 5) Auth, Roles, and Security Hardening

### 5.1 Session Model

- Cookie: `fortexa_session`
- HMAC-signed token (`FORTEXA_AUTH_SECRET` required)
- Roles: `operator`, `viewer`

Wallet login is role-mapped via allowlisted public keys:
- `FORTEXA_OPERATOR_WALLETS` (comma-separated `G...` keys)
- `FORTEXA_VIEWER_WALLETS` (comma-separated `G...` keys)

### 5.2 Login Hardening

- Login rate limiting
- Brute-force lockout (`FORTEXA_AUTH_MAX_ATTEMPTS`, `FORTEXA_AUTH_LOCK_MINUTES`)

### 5.3 Shared Security State (Optional)

- If `FORTEXA_SHARED_STATE_PATH` is set, lockout and rate-limit state is persisted to a shared file.
- This improves consistency compared to per-process in-memory state.

**Honest note:** this is still file-based, not a true distributed lock system like Redis.

### 5.4 Security Headers (`src/proxy.ts`)

- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Permissions-Policy`
- `Cross-Origin-*`
- `x-request-id`

---

## 6) Stellar Payment Flow (Wallet-Agnostic)

Fortexa does **not** store private keys.

Flow:
1. Authenticate with your wallet (`/login`) and bind session identity.
2. Build unsigned payment XDR (`/api/stellar/build-payment`).
3. Sign in wallet of choice.
4. Submit signed XDR (`/api/stellar/submit-signed`).

The direct `/api/stellar/pay` path is intentionally disabled.

---

## 7) Persistence Model

### 7.1 DB-first with File Fallback

Stores:
- `audit-store`
- `policy-store`
- `user-wallet-store`

If `DATABASE_URL` is configured, Postgres is attempted first.
If DB is unavailable (or not configured), the system falls back to `.fortexa/*.json` stores.

### 7.2 Versioned Migrations

- Migrations: `src/lib/storage/migrations.ts`
- Runner/helper: `src/lib/storage/db.ts`
- Tracking table: `fortexa_schema_migrations`
- Manual command: `npm run db:migrate`

---

## 8) Observability

### 8.1 Metrics
- Request volume by route/method
- Error count + error rate
- Average + p95 latency
- Prometheus text export

### 8.2 Health
- `GET /api/health`
- Returns env readiness flags (`hasGroqKey`, `hasAuthSecret`, `hasHorizonUrl`)

### 8.3 Ops Dashboard (`/ops`)
- Health snapshot
- Request/error summary
- Route hotlist
- Rolling trends
- Signed transaction count from audit export

---

## 9) Local Setup

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

---

## 10) Environment Variables

Use `.env.example` as source of truth:

```bash
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org

DATABASE_URL=
DATABASE_SSL=false

FORTEXA_SHARED_STATE_PATH=

GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile

FORTEXA_AUTH_SECRET=
FORTEXA_OPERATOR_WALLETS=
FORTEXA_VIEWER_WALLETS=
FORTEXA_AUTH_MAX_ATTEMPTS=5
FORTEXA_AUTH_LOCK_MINUTES=10

NEXT_PUBLIC_STELLAR_DESTINATION=
```

---

## 11) Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run test:watch
npm run demo:scenarios
npm run db:migrate
```

---

## 12) Testing Coverage

Current suite includes:
- auth/session/lockout tests
- shared-state rate-limit tests
- DB helper/migration tests
- policy/decision/auth/audit route tests
- observability metrics tests

Current verified local status:
- `npm run lint` ✅
- `npm run test` ✅

---

## 13) Known Limitations

1. Shared security state is file-based (not Redis/distributed locking).
2. Risk scoring is heuristic-heavy (no threat intel feed integration yet).
3. `/api/agent/plan` does not currently use the same request-context helper used by key audited routes.
4. Stellar support is testnet-focused.
5. Server-side signing is intentionally disabled.
6. Docker support is intentionally removed in this repository.

---

## 14) Practical Roadmap

- Redis adapter for shared security state
- Multi-tenant policy profiles
- Stronger risk scoring (intel + anomaly)
- Tamper-evident audit integrity model
- Production-grade Stellar lifecycle hardening

---

## 15) Quick Demo Flow

1. Login with an operator-allowlisted wallet
2. Verify session wallet in `/wallet`
3. Evaluate scenario or AI-generated action in `/console`
4. Trigger and manually approve a `REQUIRE_APPROVAL` case
5. Build unsigned XDR, sign with wallet, submit signed XDR
6. Show evidence in `/activity` and telemetry in `/ops`

---

## 16) License

This project is licensed under `MIT` (see `package.json`).
