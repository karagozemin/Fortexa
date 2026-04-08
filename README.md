# Fortexa

<p align="center">
  <img src="public/fortexa-logo.jpeg" alt="Fortexa logo" width="200" />
</p>

<p align="center"><strong>Policy-Controlled Payment Firewall for Autonomous Agent Actions on Stellar</strong></p>

Fortexa is a **policy-controlled payment firewall for autonomous agent actions on Stellar**.
It sits between agent intent and economic execution, applies governance/risk checks, and keeps an auditable decision trail.

This document reflects the **current implementation** in this repository.

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

- Login payload: wallet public key (`G...`).
- Role is resolved via allowlists:
  - `FORTEXA_OPERATOR_WALLETS`
  - `FORTEXA_VIEWER_WALLETS`
- If both allowlists are empty, current behavior falls back to `operator` role for any valid wallet (recommended only for local/dev).
- Session cookie: `fortexa_session` (HMAC-signed).

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

### 6.2 Signed XDR Payment Path

1. Evaluate action in `/console`.
2. Build unsigned tx: `POST /api/stellar/build-payment`.
3. `Submit Signed XDR` orchestrates signing/submission path:
   - if signed input is already present → submit directly
   - if unsigned input is present → wallet signing is triggered first, then submit
4. Submit signed tx: `POST /api/stellar/submit-signed`.
5. Explorer URL is returned and shown as clickable link.

Additional behavior:
- XDR build timeout configured to 180 seconds.
- Submit errors include Horizon result codes when available.

---

## 7) 📜 Audit and Evidence

- Decisions are appended to audit store at evaluation time.
- `/activity` reads entries by authenticated session user id.
- Export endpoint supports `mine` and `all` scopes in JSON/CSV.

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

---

## 9) 🌍 Environment Variables

Reference (`.env.example`):

```bash
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org

DATABASE_URL=
DATABASE_SSL=false

FORTEXA_STORE_DIR=

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

## 10) ▶️ Scripts

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

## 11) 🔌 API Surface (Reference)

### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `POST /api/auth/refresh`

### Policy
- `GET /api/policy`
- `POST /api/policy` (`operator`)
- `GET /api/policy/history` (`operator`)
- `POST /api/policy/rollback` (`operator`)

### Decision / Planning
- `POST /api/decision` (`operator`)
- `POST /api/agent/plan` (`operator`, Groq-backed)

### Audit / Observability
- `GET /api/audit`
- `GET /api/audit/export?format=json|csv&scope=mine|all`
- `GET /api/health`
- `GET /api/metrics` (`?format=prometheus`)

### Stellar
- `GET /api/stellar/balance`
- `POST /api/stellar/setup` (session-wallet bootstrap/sync helper; not manual wallet linking)
- `POST /api/stellar/build-payment`
- `POST /api/stellar/submit-signed`
- `POST /api/stellar/pay` (legacy disabled)
- `POST /api/stellar/fund` (removed behavior, returns `410`)

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

- Health endpoint: `GET /api/health`
- Metrics endpoint: `GET /api/metrics` + Prometheus format
- `/ops` dashboard shows:
  - service health
  - total requests
  - error rate
  - signed tx count
  - top routes + rolling trend

Ops dashboard initial load is optimized so core telemetry renders first; slow TX-count fetch no longer blocks first paint.

---

## 14) 💾 Persistence (Appendix)

### DB-first with File Fallback

Stores include:
- `audit-store`
- `policy-store`
- `user-wallet-store`

If `DATABASE_URL` is available and healthy, Postgres is used.
Otherwise Fortexa falls back to local JSON files:
- local/dev default: `.fortexa/*.json`
- Vercel default: `/tmp/fortexa/*.json`

Optional overrides:
- `FORTEXA_STORE_DIR` to set file-store directory explicitly
- `FORTEXA_SHARED_STATE_PATH` for shared lockout/rate-limit state file path
  - use an absolute path on Vercel (example: `/tmp/fortexa/shared-security-state.json`)

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

## 16) 🧪 Known Limitations (Current)

1. Shared security state is file-based (not distributed locking like Redis).
2. Risk scoring remains heuristic-heavy (no external threat-intel integration).
3. Stellar workflow is testnet-oriented.
4. Server-side signing remains intentionally disabled.
5. Full end-to-end automated coverage for the complete decision-to-payment lifecycle is still limited.

Fortexa is intentionally optimized for hackathon clarity and wallet-native control, not full production deployment.

---

## 17) 🛣️ Practical Next Steps

- Introduce distributed shared state backend (Redis).
- Add stronger risk intelligence + anomaly detection.
- Expand end-to-end payment verification and automated lifecycle tests.

---

## 18) 📄 License

MIT (see `package.json`).
