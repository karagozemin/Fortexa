# Fortexa

Fortexa is a **policy-controlled agent wallet and security layer on Stellar**.
It sits between an autonomous AI agent and external economic actions, enforcing programmable limits, endpoint validation, risk checks, and approval logic before any payment/tool execution.

## Why this matters
Agent systems can reason and act, but giving them direct payment authority is unsafe. One compromised tool output or malicious endpoint can trigger unauthorized transfers.

Fortexa solves this by adding a visible, explainable control layer that evaluates every action and returns:
- `APPROVE`
- `WARN`
- `REQUIRE_APPROVAL`
- `BLOCK`

## Problem
Autonomous agents are increasingly asked to:
- pay for API calls,
- unlock premium tools,
- send funds to workers/services,
- execute transaction-like actions.

Without policy and risk controls, they can overspend, call untrusted endpoints, or follow prompt-injected instructions.

## Solution
Fortexa combines:
1. **Agent Wallet Layer** (Stellar testnet identity + balance)
2. **Policy Engine** (allow/block lists + spend limits + call limits)
3. **Security Evaluation Layer** (prompt injection + domain risk + suspicious patterns)
4. **Decision Engine** (explainable decision outputs)
5. **Audit Trail** (timestamped logs with trigger details)

## MVP Features
- Stellar testnet wallet visibility (`public key`, `balance`, `friendbot` funding)
- Configurable policy rules:
  - allowed/blocked domains
  - allowed/blocked tools
  - per-transaction cap
  - daily cap
  - max tool calls/day
  - time window controls
  - risk threshold
- Security checks:
  - destination/domain reputation heuristics
  - malicious instruction pattern detection
  - prompt injection detection in tool output
  - high-risk target warnings
- Explainable decision output for each attempted action
- Scenario runner with seeded judge-friendly demos
- Activity log with policies + risk findings per decision
- Real Stellar testnet payment execution via wallet-signed XDR submission
- Live AI action planning via Groq (`/api/agent/plan`) with policy/security decisioning

## Demo Scenarios
Included in `src/lib/scenarios/seed.ts`:
1. Safe research tool payment → expected `APPROVE`
2. Malicious/unapproved endpoint payment attempt → expected `BLOCK`
3. Over-budget action → expected `REQUIRE_APPROVAL`
4. Prompt-injected tool result → expected `BLOCK`
5. Manual approval flow → expected `REQUIRE_APPROVAL` then operator override to `APPROVE`

## Architecture

### Frontend
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn-style component primitives in `src/components/ui`

### Core Modules
- `src/lib/types/domain.ts` → canonical domain types
- `src/lib/policy/engine.ts` → policy checks
- `src/lib/security/analyzer.ts` → risk findings + scoring
- `src/lib/decision/engine.ts` → final decision orchestration
- `src/lib/scenarios/seed.ts` → demo scenarios + defaults
- `src/lib/storage/audit-store.ts` → user-scoped persistent audit + usage state
- `src/lib/stellar/client.ts` → Stellar testnet integration
- `src/lib/storage/user-wallet-store.ts` → per-user external Stellar wallet assignment

### API Routes
- `POST /api/auth/login` → start session with operator/viewer credentials
- `POST /api/auth/logout` → clear session
- `GET /api/auth/session` → current auth session status
- `GET /api/policy` → read active policy config
- `POST /api/policy` → update active policy config (operator only)
- `POST /api/agent/plan` → generate a live `AgentAction` from prompt/context via Groq
- `POST /api/decision` → evaluate action and append audit entry
- `GET /api/audit` → retrieve audit trail
- `GET /api/stellar/balance` → wallet identity + balance
- `POST /api/stellar/fund` → friendbot funding
- `POST /api/stellar/setup` → link external Stellar wallet public key to current user
- `POST /api/stellar/build-payment` → build unsigned payment XDR
- `POST /api/stellar/submit-signed` → submit wallet-signed XDR to Horizon
- `POST /api/stellar/pay` → disabled (legacy); use signed XDR flow

### Pages
- `/` → overview dashboard + wallet card
- `/wallet` → wallet testnet operations
- `/policies` → visible policy rules
- `/policies` → view/edit active runtime policy config
- `/console` → live decision console + optional payment execution
- `/scenarios` → scenario catalog
- `/activity` → audit trail

## Stellar Integration Details
Fortexa supports **any Stellar wallet** that can sign transactions:
- User links wallet by Stellar public key (`G...`).
- Fortexa builds unsigned Stellar testnet XDR.
- User signs with their wallet of choice (Freighter supported as quick path).
- Fortexa submits signed XDR to Horizon and returns real tx hash.

### User-assigned wallet model
- Each user receives a stable `fortexa_user_id` cookie.
- Wallet assignment is persisted per user in local storage files under `.fortexa/`.
- Only public wallet metadata is stored; no custodial private keys are stored in repo files.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Minimal Env Config

```bash
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_FRIENDBOT_URL=https://friendbot.stellar.org
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
FORTEXA_AUTH_SECRET=
FORTEXA_OPERATOR_EMAIL=operator@fortexa.local
FORTEXA_OPERATOR_PASSWORD=
FORTEXA_VIEWER_EMAIL=viewer@fortexa.local
FORTEXA_VIEWER_PASSWORD=
NEXT_PUBLIC_STELLAR_DESTINATION=
```

## Tests & Demo Harness

```bash
npm run test
npm run demo:scenarios
npm run lint
```

## CI Quality Gate

GitHub Actions workflow is available at `.github/workflows/ci.yml` and runs:
- `npm run lint`
- `npm run test`
- `npm run build`

on every pull request and push to `main`.

## Docker

The project ships with a production `Dockerfile` using Next.js standalone output.

Build image:

```bash
docker build -t fortexa:latest .
```

Run container:

```bash
docker run --rm -p 3000:3000 --env-file .env.local fortexa:latest
```

## Security Middleware

Global HTTP hardening headers are applied via `src/proxy.ts`:
- `Content-Security-Policy`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy`
- `Cross-Origin-Resource-Policy`
- `x-request-id`

## Hackathon Demo Narrative (2 minutes)
1. Open overview: show wallet + active policies.
2. Link any Stellar wallet in `/wallet` (Freighter optional quick connect) and fund testnet if needed.
3. In decision console run safe scenario (`APPROVE`) and prepare payment XDR.
4. Sign transaction in wallet flow and submit signed XDR; show real Stellar tx hash.
5. Run malicious endpoint (`BLOCK`) and over-budget flow (`REQUIRE_APPROVAL`).
6. Open audit trail to show timestamped explainable governance history.

## Future Improvements
- Persistent DB-backed policy and audit storage
- Multi-agent org policy profiles and role-based approvals
- Enhanced risk models (threat intel feeds, anomaly scoring)
- Signed policy snapshots and tamper-evident audit proofs
- SEP integrations and production wallet lifecycle hardening

## Known Limitations
- Signed transaction submission requires wallet-side signature; server-side auto-signing is intentionally disabled.

## Hackathon Framing
Fortexa is not a generic wallet UI and not a chatbot demo. It is a **trust layer for autonomous machine payments**: an agent payment firewall that makes AI economic actions safe, governable, and auditable on Stellar.
