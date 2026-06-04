import { promises as fs } from "node:fs";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const tmpDir = `/tmp/fortexa-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  process.env.FORTEXA_STORE_DIR = tmpDir;
  process.env.FORTEXA_AUTH_SECRET = "e2e-test-secret";
  process.env.STELLAR_HORIZON_URL = "https://horizon-mock.test";
  delete process.env.DATABASE_URL;
});

const horizonMocks = vi.hoisted(() => ({
  loadAccount: vi.fn(),
  fetchBaseFee: vi.fn(),
  submitTransaction: vi.fn(),
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
    submitTransaction(tx: unknown) {
      return horizonMocks.submitTransaction(tx);
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

import { Account, Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { NextRequest } from "next/server";

import { POST as decisionPost } from "@/app/api/decision/route";
import { POST as buildPaymentPost } from "@/app/api/stellar/build-payment/route";
import { POST as submitSignedPost } from "@/app/api/stellar/submit-signed/route";
import { AUTH_COOKIE_KEY, createSessionToken } from "@/lib/auth/session";
import { defaultPolicyConfig } from "@/lib/policy/engine";
import { listAuditEntries, resetAuditState } from "@/lib/storage/audit-store";
import { getPolicyConfig, updatePolicyConfig } from "@/lib/storage/policy-store";
import { upsertUserWallet } from "@/lib/storage/user-wallet-store";

const OPERATOR_USER_ID = "e2e-operator-id";

function operatorCookie() {
  const token = createSessionToken({
    email: "e2e-operator@fortexa.local",
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

const sourceKeypair = Keypair.random();
const destinationKeypair = Keypair.random();
const mockTxHash = "a".repeat(64);

beforeAll(async () => {
  const { policy } = await getPolicyConfig();
  await updatePolicyConfig(
    {
      ...defaultPolicyConfig,
      ...policy,
      allowedHours: { start: 0, end: 23 },
    },
    "e2e-test-setup"
  );

  await upsertUserWallet(OPERATOR_USER_ID, {
    publicKey: sourceKeypair.publicKey(),
    source: "external",
    provider: "freighter",
  });
});

afterAll(async () => {
  const storeDir = process.env.FORTEXA_STORE_DIR;
  if (storeDir && storeDir.startsWith("/tmp/fortexa-e2e-")) {
    await fs.rm(storeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

beforeEach(async () => {
  horizonMocks.loadAccount.mockReset();
  horizonMocks.fetchBaseFee.mockReset();
  horizonMocks.submitTransaction.mockReset();

  horizonMocks.loadAccount.mockImplementation(async (accountId: string) => {
    return new Account(accountId, "1234");
  });
  horizonMocks.fetchBaseFee.mockResolvedValue(100);
  horizonMocks.submitTransaction.mockResolvedValue({
    hash: mockTxHash,
    ledger: 42,
    successful: true,
    result_xdr: "AAAAAAAAAGQAAAAAAAAAAQAAAAAAAAABAAAAAAAAAAA=",
  });

  await resetAuditState(OPERATOR_USER_ID);
});

async function runOperatorFlow(decisionBody: Record<string, unknown>, paymentAmount: string) {
  const decisionRes = await decisionPost(
    jsonRequest("http://localhost/api/decision", decisionBody)
  );
  expect(decisionRes.status).toBe(200);

  const decisionPayload = (await decisionRes.json()) as {
    result: { decision: string; riskScore: number };
    auditEntry: { id: string; decision: string };
    userId: string;
  };

  const buildRes = await buildPaymentPost(
    jsonRequest("http://localhost/api/stellar/build-payment", {
      destination: destinationKeypair.publicKey(),
      amountXLM: paymentAmount,
      memo: "e2e-test",
    })
  );
  expect(buildRes.status).toBe(200);

  const buildPayload = (await buildRes.json()) as {
    ok: boolean;
    xdr: string;
    networkPassphrase: string;
    sourcePublicKey: string;
  };

  const unsignedTx = TransactionBuilder.fromXDR(buildPayload.xdr, buildPayload.networkPassphrase);
  unsignedTx.sign(sourceKeypair);
  const signedXdr = unsignedTx.toXDR();

  const submitRes = await submitSignedPost(
    jsonRequest("http://localhost/api/stellar/submit-signed", { signedXdr })
  );
  expect(submitRes.status).toBe(200);

  const submitPayload = (await submitRes.json()) as {
    ok: boolean;
    explorerUrl: string;
    payment: { hash: string; ledger: number; status: string };
  };

  return { decisionPayload, buildPayload, submitPayload };
}

describe("E2E: decision → build XDR → submit (Horizon mocked)", () => {
  it("APPROVE path: safe scenario evaluates, builds XDR, and submits via mocked Horizon", async () => {
    const { decisionPayload, buildPayload, submitPayload } = await runOperatorFlow(
      { scenarioId: "safe-research-payment" },
      "18.0000000"
    );

    expect(decisionPayload.userId).toBe(OPERATOR_USER_ID);
    expect(decisionPayload.result.decision).toBe("APPROVE");

    const auditEntries = await listAuditEntries(OPERATOR_USER_ID);
    expect(auditEntries.length).toBe(1);
    expect(auditEntries[0].decision).toBe("APPROVE");
    expect(auditEntries[0].id).toBe(decisionPayload.auditEntry.id);

    expect(buildPayload.ok).toBe(true);
    expect(buildPayload.networkPassphrase).toBe(Networks.TESTNET);
    expect(buildPayload.sourcePublicKey).toBe(sourceKeypair.publicKey());
    expect(typeof buildPayload.xdr).toBe("string");
    expect(buildPayload.xdr.length).toBeGreaterThan(20);
    expect(horizonMocks.loadAccount).toHaveBeenCalledWith(sourceKeypair.publicKey());
    expect(horizonMocks.fetchBaseFee).toHaveBeenCalled();

    expect(submitPayload.ok).toBe(true);
    expect(submitPayload.payment.hash).toBe(mockTxHash);
    expect(submitPayload.payment.status).toBe("submitted");
    expect(submitPayload.explorerUrl).toBe(
      `https://stellar.expert/explorer/testnet/tx/${mockTxHash}`
    );
    expect(horizonMocks.submitTransaction).toHaveBeenCalledTimes(1);
  });

  it("WARN path: medium-risk custom action still flows through build + submit", async () => {
    const warnAction = {
      id: "act-warn-e2e",
      name: "High-value approved research call",
      kind: "api_payment" as const,
      target: "research-pro:premium-report",
      domain: "api.safe-research.ai",
      amountXLM: 95,
      tool: "research-pro",
      outputPreview: "Routine premium report — no instructions to bypass anything.",
    };

    const { decisionPayload, submitPayload } = await runOperatorFlow(
      { action: warnAction },
      "95.0000000"
    );

    expect(decisionPayload.result.decision).toBe("WARN");

    const auditEntries = await listAuditEntries(OPERATOR_USER_ID);
    expect(auditEntries.length).toBe(1);
    expect(auditEntries[0].decision).toBe("WARN");

    expect(submitPayload.explorerUrl).toContain(mockTxHash);
    expect(submitPayload.payment.hash).toBe(mockTxHash);
  });

  it("never reaches live Horizon (mocked Server is the only Server used)", async () => {
    await runOperatorFlow({ scenarioId: "safe-research-payment" }, "18.0000000");

    expect(horizonMocks.loadAccount).toHaveBeenCalled();
    expect(horizonMocks.submitTransaction).toHaveBeenCalled();
  });
});
