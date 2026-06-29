# Threat Model Test Matrix

Maps concrete abuse cases against test coverage. Gaps are surfaced as follow-up issues.

---

## Coverage Legend

| Icon | Meaning |
|------|---------|
| ✅ **Covered** | Explicit test(s) validate the control |
| 🟡 **Partial** | Control exists but untested in this scenario, or only part of the attack surface is covered |
| ❌ **Uncovered** | No test and no evident control |

---

## Matrix

| # | Abuse Case | Attack Description | Control(s) | Test Coverage | Existing Tests | Gap / Follow-up |
|---|------------|-------------------|------------|---------------|----------------|-----------------|
| 1 | **Excessive payment amount** | Agent submits a payment exceeding per-transaction or daily caps | Policy engine `perTxCapXLM` / `dailyCapXLM` enforce `REQUIRE_APPROVAL` or `BLOCK`; build-payment rejects tampered amounts | ✅ **Covered** | `src/lib/policy/engine.test.ts:104-124` (cap triggers), `src/lib/decision/engine.test.ts:38-42` (over-budget scenario), `src/app/api/stellar/build-payment/route.test.ts:190-207` (tampered amount) | — |
| 2 | **Untrusted domain or tool target** | Agent targets a wallet-drainer domain, blocked tool, or typosquat TLD | Policy allowlist/blocklist, security analyzer heuristics, blocklist feed | ✅ **Covered** | `src/lib/policy/engine.test.ts:59-98` (blocked/unlisted domain & tool), `src/lib/security/analyzer.test.ts:58-101` (domain reputation, TLD, redirect traps), `src/lib/decision/engine.test.ts:32-36,51-57` (malicious endpoint & typosquat scenarios), `src/lib/security/analyzer.test.ts:117-185` (blocklist feed) | — |
| 3 | **Repeated submission attempt (XDR replay / spam)** | Attacker replays the same signed XDR (or many different XDRs) to spam Horizon or double-spend | Idempotency key deduplication; rate-limit middleware | 🟡 **Partial** | `src/app/api/stellar/submit-signed-idempotency.test.ts` (key replay rejected), `src/lib/security/rate-limit.test.ts` (generic bucket limiter) | No test validates that the submit-signed endpoint itself is rate-limited per user/IP. Follow-up: add rate-limit test for `POST /api/stellar/submit-signed`. |
| 4 | **Viewer attempting operator-only action** | A viewer-role user calls policy update, rollback, build-payment, or decision endpoints | `require-auth` middleware gates by `allowedRoles` | 🟡 **Partial** | `src/app/api/audit/export/route.test.ts:142-159` (viewer rejected for `scope=all`) | Remaining operator-only routes (policy CRUD, rollback, build-payment, decision, simulate) lack a dedicated viewer-rejection test. Follow-up: add `expect(status).toBe(403)` for viewer sessions on each operator-gated route. |
| 5 | **Policy rollback misuse** | Operator rolls back to a non-existent version, or a viewer attempts rollback | `POST /api/policy/rollback` requires operator role; route validates `targetVersion` | 🟡 **Partial** | `src/app/api/policy/rollback/route.test.ts` (auth required, operator can rollback to v1) | No test for viewer rejection (403), no test for rollback to out-of-range version. Follow-up: add bounds-check test + viewer rejection test. |
| 6 | **Unsigned / mismatched wallet payment submission** | Attacker submits an XDR signed by a keypair that does not match the user's registered wallet | No signature verification on submit-signed | ❌ **Uncovered** | — | The `POST /api/stellar/submit-signed` route does not verify that the XDR was signed by the Stellar key registered to the session user. An attacker with a valid session (or a compromised session cookie) could submit payments from any wallet. Follow-up: add server-side verification that `source` in the signed XDR matches the user's registered wallet public key. |
| 7 | **Audit export tampering** | Attacker modifies stored audit entries before export, or exports data inconsistent with the hash chain | Tamper-evident hash chain (`verifyHashChain`); export filters validated | ✅ **Covered** | `src/lib/audit/hash-chain.test.ts` (modified/deleted/reordered entry detection), `src/app/api/audit/export/route.test.ts` (query validation, role scoping) | — |
| 8 | **Build payment from BLOCKED / REQUIRE_APPROVAL decision** | Agent skips the decision step and calls build-payment directly with a non-APPROVE audit entry | `verifyPaymentAgainstQuote` rejects non-APPROVE decisions | ✅ **Covered** | `src/lib/stellar/verify-payment-quote.test.ts:49-64` (blocked decision rejected), `src/app/api/stellar/build-payment/route.test.ts` (build gated on audit entry) | — |
| 9 | **Human-approval bypass via direct build** | For a `REQUIRE_APPROVAL` decision, attacker calls build-payment without going through the approval UI flow | `verifyPaymentAgainstQuote` checks decision === `APPROVE`; `approvedByHuman` flag must be set | ✅ **Covered** | Covered implicitly by the same `verify-payment-quote.test.ts` (any non-APPROVE decision is rejected) | The `approvedByHuman` flag logic in the decision engine lacks a dedicated unit test. Consider adding an explicit test that a `REQUIRE_APPROVAL` entry with `approvedByHuman: true` is accepted while one without is rejected. |
| 10 | **Race condition on concurrent policy writes** | Two operators update policy simultaneously; one write silently overwrites the other | File-based policy store with no locking or version conflict detection | ❌ **Uncovered** | `src/lib/storage/policy-store.test.ts` (basic read/write, no concurrency) | No test or guard for concurrent writes. Follow-up: add optimistic concurrency (version check on write) and a test that verifies conflicting writes are rejected. |

---

## Summary

| Status | Count |
|--------|-------|
| ✅ Covered | 5 |
| 🟡 Partial | 3 |
| ❌ Uncovered | 2 |

**Open follow-up issues (to be created):**

1. `test: rate-limit POST /api/stellar/submit-signed per user/IP` — closes gap #3
2. `test: reject viewer sessions on operator-gated routes (policy, rollback, build-payment, decision)` — closes gap #4
3. `test: reject rollback to out-of-range version` — closes gap #5
4. `feat+test: verify submit-signed XDR source matches registered wallet` — closes gap #6
5. `test: approvedByHuman flag gating for REQUIRE_APPROVAL build-payment` — closes gap #9
6. `feat+test: optimistic concurrency for policy store writes` — closes gap #10
