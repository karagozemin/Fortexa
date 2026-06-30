import { promises as fs } from "node:fs";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const tmpDir = `/tmp/fortexa-idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  process.env.FORTEXA_STORE_DIR = tmpDir;
  process.env.FORTEXA_AUTH_SECRET = "idem-test-secret";
  process.env.STELLAR_HORIZON_URL = "https://horizon-mock.test";
  delete process.env.DATABASE_URL;
});

const horizonMocks = vi.hoisted(() => ({
  submitTransaction: vi.fn(),
}));

vi.mock("@stellar/stellar-sdk", async () => {
  const actual =
    await vi.importActual<typeof import("@stellar/stellar-sdk")>("@stellar/stellar-sdk");

  class MockServer {
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

import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { NextRequest } from "next/server";

import { POST as submitSignedPost } from "@/app/api/stellar/submit-signed/route";
import { AUTH_COOKIE_KEY, createSessionToken } from "@/lib/auth/session";
import { resetSubmitIdempotencyState } from "@/lib/storage/submit-idempotency-store";
import { upsertUserWallet } from "@/lib/storage/user-wallet-store";

const OPERATOR_USER_ID = "idem-operator-id";
const mockTxHash = "b".repeat(64);

// Fixed source wallet for this operator. The submit-signed route now verifies
// that a signed XDR's source account matches the session wallet (issue #26),
// so every signed transaction in this file must be built FROM this keypair,
// and this keypair must be registered as idem-operator-id's session wallet.
const OPERATOR_WALLET_KEYPAIR = Keypair.random();

function operatorCookie() {
  const token = createSessionToken({
    email: "idem-operator@fortexa.local",
    role: "operator",
    userId: OPERATOR_USER_ID,
    expiresInSeconds: 300,
  });

  return `${AUTH_COOKIE_KEY}=${token}`;
}

function submitRequest(body: unknown, extraHeaders: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/stellar/submit-signed", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: operatorCookie(),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

function buildSignedXdr(amount: string) {
  const destination = Keypair.random();
  const account = new Account(OPERATOR_WALLET_KEYPAIR.publicKey(), "1");
  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: destination.publicKey(),
        asset: Asset.native(),
        amount,
      })
    )
    .setTimeout(30)
    .build();
  tx.sign(OPERATOR_WALLET_KEYPAIR);
  return tx.toXDR();
}

beforeEach(async () => {
  horizonMocks.submitTransaction.mockReset();
  horizonMocks.submitTransaction.mockResolvedValue({
    hash: mockTxHash,
    ledger: 42,
    successful: true,
    result_xdr: "AAAAAAAAAGQAAAAAAAAAAQAAAAAAAAABAAAAAAAAAAA=",
  });

  await resetSubmitIdempotencyState(OPERATOR_USER_ID);

  await upsertUserWallet(OPERATOR_USER_ID, {
    publicKey: OPERATOR_WALLET_KEYPAIR.publicKey(),
    source: "external",
    provider: "test-fixture",
  });
});

afterAll(async () => {
  const storeDir = process.env.FORTEXA_STORE_DIR;
  if (storeDir && storeDir.startsWith("/tmp/fortexa-idem-")) {
    await fs.rm(storeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

describe("submit-signed idempotency", () => {
  it("replays the cached result for the same key + same XDR without resubmitting", async () => {
    const signedXdr = buildSignedXdr("1.0000000");
    const key = "idem-key-replay-001";

    const first = await submitSignedPost(submitRequest({ signedXdr, idempotencyKey: key }));
    expect(first.status).toBe(200);
    const firstBody = await first.json();

    const second = await submitSignedPost(submitRequest({ signedXdr, idempotencyKey: key }));
    expect(second.status).toBe(200);
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");
    const secondBody = await second.json();

    expect(secondBody).toEqual(firstBody);
    expect(horizonMocks.submitTransaction).toHaveBeenCalledTimes(1);
  });

  it("returns 409 for the same key with a different signed XDR", async () => {
    const key = "idem-key-conflict-001";
    const firstXdr = buildSignedXdr("1.0000000");
    const secondXdr = buildSignedXdr("2.0000000");

    const first = await submitSignedPost(submitRequest({ signedXdr: firstXdr, idempotencyKey: key }));
    expect(first.status).toBe(200);

    const conflict = await submitSignedPost(
      submitRequest({ signedXdr: secondXdr, idempotencyKey: key })
    );
    expect(conflict.status).toBe(409);
    expect(horizonMocks.submitTransaction).toHaveBeenCalledTimes(1);
  });

  it("preserves current behavior when no idempotency key is provided", async () => {
    const signedXdr = buildSignedXdr("1.0000000");

    const first = await submitSignedPost(submitRequest({ signedXdr }));
    expect(first.status).toBe(200);

    const second = await submitSignedPost(submitRequest({ signedXdr }));
    expect(second.status).toBe(200);

    expect(horizonMocks.submitTransaction).toHaveBeenCalledTimes(2);
  });

  it("accepts the idempotency key via the Idempotency-Key header", async () => {
    const signedXdr = buildSignedXdr("1.0000000");
    const key = "idem-key-header-001";

    const first = await submitSignedPost(submitRequest({ signedXdr }, { "Idempotency-Key": key }));
    expect(first.status).toBe(200);

    const second = await submitSignedPost(submitRequest({ signedXdr }, { "Idempotency-Key": key }));
    expect(second.status).toBe(200);
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");
    expect(horizonMocks.submitTransaction).toHaveBeenCalledTimes(1);
  });
});
