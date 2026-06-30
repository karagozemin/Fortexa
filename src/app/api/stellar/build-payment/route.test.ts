import { promises as fs } from "node:fs";

import { Keypair } from "@stellar/stellar-sdk";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const tmpDir = `/tmp/fortexa-build-payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  process.env.FORTEXA_STORE_DIR = tmpDir;
  process.env.FORTEXA_AUTH_SECRET = "build-payment-test-secret";
  process.env.STELLAR_HORIZON_URL = "https://horizon-mock.test";
  delete process.env.DATABASE_URL;
});

const horizonMocks = vi.hoisted(() => ({
  loadAccount: vi.fn(),
  fetchBaseFee: vi.fn(),
}));

vi.mock("@stellar/stellar-sdk", async () => {
  const actual =
    await vi.importActual<typeof import("@stellar/stellar-sdk")>("@stellar/stellar-sdk");

  class MockServer {
    loadAccount(accountId: string) {
      return horizonMocks.loadAccount(accountId);
    }
    fetchBaseFee() {
      return horizonMocks.fetchBaseFee();
    }
  }

  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: MockServer,
    },
  };
});

import { Account } from "@stellar/stellar-sdk";
import { NextRequest } from "next/server";

import { POST as decisionPost } from "@/app/api/decision/route";
import { POST as buildPaymentPost } from "@/app/api/stellar/build-payment/route";
import { AUTH_COOKIE_KEY, createSessionToken } from "@/lib/auth/session";
import { defaultPolicyConfig } from "@/lib/policy/engine";
import { resetAuditState } from "@/lib/storage/audit-store";
import { getPolicyConfig, updatePolicyConfig } from "@/lib/storage/policy-store";
import { upsertUserWallet } from "@/lib/storage/user-wallet-store";

const OPERATOR_USER_ID = "build-payment-operator";

const sourceKeypair = Keypair.random();
const destinationKeypair = Keypair.random();
const authorizedAmount = "18.0000000";
const authorizedMemo = "fortexa:act-safe-1";

function operatorCookie() {
  const token = createSessionToken({
    email: "build-payment@fortexa.local",
    role: "operator",
    userId: OPERATOR_USER_ID,
    expiresInSeconds: 300,
  });

  return `${AUTH_COOKIE_KEY}=${token}`;
}

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: operatorCookie(),
    },
    body: JSON.stringify(body),
  });
}

function authorizedBuildBody(overrides: Record<string, unknown> = {}) {
  return {
    auditEntryId: "",
    destination: destinationKeypair.publicKey(),
    amountXLM: authorizedAmount,
    asset: "native",
    memo: authorizedMemo,
    network: "testnet",
    ...overrides,
  };
}

let lastAuditEntryId = "";

async function authorizePaymentDecision() {
  const decisionRes = await decisionPost(
    jsonRequest("http://localhost/api/decision", {
      scenarioId: "safe-research-payment",
      paymentQuoteInput: {
        destination: destinationKeypair.publicKey(),
        memo: authorizedMemo,
        network: "testnet",
      },
    }),
  );
  expect(decisionRes.status).toBe(200);

  const payload = (await decisionRes.json()) as {
    auditEntry: { id: string; paymentQuote?: { destination: string } };
  };
  lastAuditEntryId = payload.auditEntry.id;
  return payload.auditEntry;
}

beforeAll(async () => {
  const { policy } = await getPolicyConfig();
  await updatePolicyConfig(
    {
      ...defaultPolicyConfig,
      ...policy,
      allowedHours: { start: 0, end: 23 },
    },
    "build-payment-test-setup",
  );

  await upsertUserWallet(OPERATOR_USER_ID, {
    publicKey: sourceKeypair.publicKey(),
    source: "external",
    provider: "freighter",
  });
});

afterAll(async () => {
  const storeDir = process.env.FORTEXA_STORE_DIR;
  if (storeDir && storeDir.startsWith("/tmp/fortexa-build-payment-")) {
    await fs.rm(storeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

beforeEach(async () => {
  horizonMocks.loadAccount.mockReset();
  horizonMocks.fetchBaseFee.mockReset();
  horizonMocks.loadAccount.mockImplementation(async (accountId: string) => {
    return new Account(accountId, "1234");
  });
  horizonMocks.fetchBaseFee.mockResolvedValue(100);

  await resetAuditState(OPERATOR_USER_ID);
  lastAuditEntryId = "";
});

describe("POST /api/stellar/build-payment quote verification", () => {
  it("builds XDR when request matches the authorized payment quote", async () => {
    await authorizePaymentDecision();

    const buildRes = await buildPaymentPost(
      jsonRequest(
        "http://localhost/api/stellar/build-payment",
        authorizedBuildBody({ auditEntryId: lastAuditEntryId }),
      ),
    );

    expect(buildRes.status).toBe(200);
    const payload = (await buildRes.json()) as { ok: boolean; xdr: string };
    expect(payload.ok).toBe(true);
    expect(payload.xdr.length).toBeGreaterThan(20);
    expect(horizonMocks.loadAccount).toHaveBeenCalledWith(sourceKeypair.publicKey());
  });

  it("rejects tampered destination", async () => {
    await authorizePaymentDecision();
    const tamperedDestination = Keypair.random().publicKey();

    const buildRes = await buildPaymentPost(
      jsonRequest(
        "http://localhost/api/stellar/build-payment",
        authorizedBuildBody({
          auditEntryId: lastAuditEntryId,
          destination: tamperedDestination,
        }),
      ),
    );

    expect(buildRes.status).toBe(403);
    const payload = (await buildRes.json()) as { error: string; field: string };
    expect(payload.field).toBe("destination");
    expect(payload.error).toContain("Destination");
  });

  it("rejects tampered amount", async () => {
    await authorizePaymentDecision();

    const buildRes = await buildPaymentPost(
      jsonRequest(
        "http://localhost/api/stellar/build-payment",
        authorizedBuildBody({
          auditEntryId: lastAuditEntryId,
          amountXLM: "99.0000000",
        }),
      ),
    );

    expect(buildRes.status).toBe(403);
    const payload = (await buildRes.json()) as { error: string; field: string };
    expect(payload.field).toBe("amountXLM");
    expect(payload.error).toContain("Amount");
  });

  it("rejects tampered memo", async () => {
    await authorizePaymentDecision();

    const buildRes = await buildPaymentPost(
      jsonRequest(
        "http://localhost/api/stellar/build-payment",
        authorizedBuildBody({
          auditEntryId: lastAuditEntryId,
          memo: "tampered-memo",
        }),
      ),
    );

    expect(buildRes.status).toBe(403);
    const payload = (await buildRes.json()) as { error: string; field: string };
    expect(payload.field).toBe("memo");
    expect(payload.error).toContain("Memo");
  });

  it("rejects tampered asset", async () => {
    await authorizePaymentDecision();

    const buildRes = await buildPaymentPost(
      jsonRequest(
        "http://localhost/api/stellar/build-payment",
        authorizedBuildBody({
          auditEntryId: lastAuditEntryId,
          asset: "usdc",
        }),
      ),
    );

    expect(buildRes.status).toBe(400);
    const payload = (await buildRes.json()) as { error: string };
    expect(payload.error).toBe("Invalid payment build request.");
  });

  it("rejects tampered network in request schema", async () => {
    await authorizePaymentDecision();

    const buildRes = await buildPaymentPost(
      jsonRequest(
        "http://localhost/api/stellar/build-payment",
        authorizedBuildBody({
          auditEntryId: lastAuditEntryId,
          network: "mainnet",
        }),
      ),
    );

    expect(buildRes.status).toBe(400);
    const payload = (await buildRes.json()) as { error: string };
    expect(payload.error).toBe("Invalid payment build request.");
  });
});

function viewerCookie() {
  const token = createSessionToken({
    email: "viewer@fortexa.local",
    role: "viewer",
    userId: "build-payment-viewer",
    expiresInSeconds: 120,
  });

  return `${AUTH_COOKIE_KEY}=${token}`;
}

describe("POST /api/stellar/build-payment authorization", () => {
  it("returns 401 when unauthenticated", async () => {
    const request = new NextRequest("http://localhost/api/stellar/build-payment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        auditEntryId: "any-id",
        destination: destinationKeypair.publicKey(),
        amountXLM: "10.0000000",
        asset: "native",
        memo: "fortexa:test",
        network: "testnet",
      }),
    });

    const response = await buildPaymentPost(request);
    expect(response.status).toBe(401);
  });

  it("returns 403 for viewer role (operator-only route)", async () => {
    const request = new NextRequest("http://localhost/api/stellar/build-payment", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: viewerCookie(),
      },
      body: JSON.stringify({
        auditEntryId: "any-id",
        destination: destinationKeypair.publicKey(),
        amountXLM: "10.0000000",
        asset: "native",
        memo: "fortexa:test",
        network: "testnet",
      }),
    });

    const response = await buildPaymentPost(request);
    expect(response.status).toBe(403);
  });
});
