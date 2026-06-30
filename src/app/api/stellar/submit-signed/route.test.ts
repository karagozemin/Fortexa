import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks -----------------------------------------------------------------
// NOTE: these mocks are written from the imports visible in route.ts. You may
// need to adjust the exact return shapes (e.g. requireAuth's session object,
// jsonWithRequestContext's signature) to match your real implementations --
// I don't have those files, so I've kept the mocks to what's structurally
// required for the route to execute.

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/http/read-json-body", () => ({
  readJsonBody: vi.fn(),
}));

vi.mock("@/lib/observability/http", () => ({
  jsonWithRequestContext: vi.fn(
    (_request: unknown, opts: { status: number; body: unknown; headers?: Record<string, string> }) =>
      new Response(JSON.stringify(opts.body), {
        status: opts.status,
        headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
      })
  ),
}));

vi.mock("@/lib/observability/logger", () => ({
  getRequestLogContext: vi.fn(() => ({})),
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("@/lib/observability/metrics", () => ({
  recordStellarSubmitResult: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: vi.fn(async () => ({ ok: true })),
  rateLimitHeaders: vi.fn(() => ({})),
}));

vi.mock("@/lib/storage/submit-idempotency-store", () => ({
  getIdempotencyRecord: vi.fn(),
  hashSignedXdr: vi.fn(() => "hash"),
  maybeRunCleanup: vi.fn(),
  putIdempotencyRecord: vi.fn(),
}));

vi.mock("@/lib/storage/user-wallet-store", () => ({
  getUserWallet: vi.fn(),
}));

vi.mock("@/lib/validation/schemas", () => ({
  stellarSubmitSignedRequestSchema: {
    safeParse: vi.fn(),
  },
}));

vi.mock("@/lib/utils/horizonErrors", () => ({
  normalizeHorizonError: vi.fn(() => "unknown"),
}));

vi.mock("@/lib/stellar/network-config", () => ({
  assertStellarNetworkConfig: () => ({
    networkPassphrase: Networks.TESTNET,
    horizonUrl: "https://horizon-testnet.stellar.org",
  }),
  getStellarHorizonUrl: () => "https://horizon-testnet.stellar.org",
}));

vi.mock("@/lib/stellar/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stellar/client")>("@/lib/stellar/client");
  return {
    ...actual,
    submitSignedTransactionXdr: vi.fn(async () => ({
      hash: "deadbeef",
      status: "submitted",
      ledger: 1,
      resultXdr: "",
    })),
  };
});

import { requireAuth } from "@/lib/auth/require-auth";
import { readJsonBody } from "@/lib/http/read-json-body";
import { getUserWallet } from "@/lib/storage/user-wallet-store";
import { stellarSubmitSignedRequestSchema } from "@/lib/validation/schemas";
import { POST } from "./route";

function buildSignedXdr(signerKp: Keypair, sourcePublicKey: string) {
  const account = new Account(sourcePublicKey, "1");
  const destination = Keypair.random();
  const tx = new TransactionBuilder(account, { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(
      Operation.payment({ destination: destination.publicKey(), asset: Asset.native(), amount: "1" })
    )
    .setTimeout(180)
    .build();
  tx.sign(signerKp);
  return tx.toXDR();
}

function buildRequest(body: unknown) {
  return new NextRequest("http://localhost/api/stellar/submit-signed", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockReturnValue({
    ok: true,
    session: { userId: "user-1" },
  } as ReturnType<typeof requireAuth>);
});

describe("POST /api/stellar/submit-signed - source wallet verification", () => {
  it("accepts a submission whose XDR source matches the session wallet", async () => {
    const walletKp = Keypair.random();
    const signedXdr = buildSignedXdr(walletKp, walletKp.publicKey());

    vi.mocked(getUserWallet).mockResolvedValue({
      userId: "user-1",
      publicKey: walletKp.publicKey(),
      source: "external",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    vi.mocked(readJsonBody).mockResolvedValue({ ok: true, data: { signedXdr } });
    vi.mocked(stellarSubmitSignedRequestSchema.safeParse).mockReturnValue({
      success: true,
      data: { signedXdr },
    } as ReturnType<typeof stellarSubmitSignedRequestSchema.safeParse>);

    const response = await POST(buildRequest({ signedXdr }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("rejects a submission whose XDR source does not match the session wallet", async () => {
    const sessionWalletKp = Keypair.random();
    const otherKp = Keypair.random();
    const signedXdr = buildSignedXdr(otherKp, otherKp.publicKey());

    vi.mocked(getUserWallet).mockResolvedValue({
      userId: "user-1",
      publicKey: sessionWalletKp.publicKey(),
      source: "external",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    vi.mocked(readJsonBody).mockResolvedValue({ ok: true, data: { signedXdr } });
    vi.mocked(stellarSubmitSignedRequestSchema.safeParse).mockReturnValue({
      success: true,
      data: { signedXdr },
    } as ReturnType<typeof stellarSubmitSignedRequestSchema.safeParse>);

    const response = await POST(buildRequest({ signedXdr }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/does not match/i);
  });

  it("rejects malformed XDR with a 400", async () => {
    const walletKp = Keypair.random();

    vi.mocked(getUserWallet).mockResolvedValue({
      userId: "user-1",
      publicKey: walletKp.publicKey(),
      source: "external",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    vi.mocked(readJsonBody).mockResolvedValue({ ok: true, data: { signedXdr: "not-valid-xdr" } });
    vi.mocked(stellarSubmitSignedRequestSchema.safeParse).mockReturnValue({
      success: true,
      data: { signedXdr: "not-valid-xdr" },
    } as ReturnType<typeof stellarSubmitSignedRequestSchema.safeParse>);

    const response = await POST(buildRequest({ signedXdr: "not-valid-xdr" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/could not be decoded/i);
  });

  it("rejects with 401 when there is no session wallet mapping", async () => {
    vi.mocked(getUserWallet).mockResolvedValue(null);

    const response = await POST(buildRequest({ signedXdr: "anything" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toMatch(/no session wallet mapping/i);
  });
});