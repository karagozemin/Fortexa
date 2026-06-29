import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { AUTH_COOKIE_KEY, createSessionToken } from "@/lib/auth/session";
import { formatSubmitError, POST } from "./route";

function mockHorizonError(txCode: string, opCodes?: string[]) {
  const error = new Error("Request failed with status code 400") as Error & {
    response: {
      data: {
        extras: {
          result_codes: {
            transaction: string;
            operations?: string[];
          };
        };
      };
    };
  };

  error.response = {
    data: {
      extras: {
        result_codes: {
          transaction: txCode,
          operations: opCodes,
        },
      },
    },
  };
  
  return error;
}

describe("formatSubmitError - Horizon error catalog", () => {
  it("maps tx_bad_seq correctly", () => {
    const error = mockHorizonError("tx_bad_seq");
    const formatted = formatSubmitError(error);
    expect(formatted.txCode).toBe("tx_bad_seq");
    expect(formatted.explanation).toContain("sequence number");
  });

  it("maps tx_insufficient_fee correctly", () => {
    const error = mockHorizonError("tx_insufficient_fee");
    const formatted = formatSubmitError(error);
    expect(formatted.txCode).toBe("tx_insufficient_fee");
    expect(formatted.explanation).toContain("fee provided is too low");
  });

  it("maps op_no_destination correctly when tx is tx_failed", () => {
    const error = mockHorizonError("tx_failed", ["op_no_destination"]);
    const formatted = formatSubmitError(error);
    expect(formatted.opCodes).toEqual(["op_no_destination"]);
    expect(formatted.explanation).toContain("destination account does not exist");
  });

  it("maps op_underfunded correctly when tx is tx_failed", () => {
    const error = mockHorizonError("tx_failed", ["op_underfunded"]);
    const formatted = formatSubmitError(error);
    expect(formatted.opCodes).toEqual(["op_underfunded"]);
    expect(formatted.explanation).toContain("lacks sufficient funds");
  });

  it("falls back gracefully for unknown codes without an explanation mapping", () => {
    const error = mockHorizonError("tx_unknown_alien_error", ["op_unknown"]);
    const formatted = formatSubmitError(error);
    expect(formatted.txCode).toBe("tx_unknown_alien_error");
    expect(formatted.opCodes).toEqual(["op_unknown"]);
    expect(formatted.explanation).toBeUndefined();
    expect(formatted.nextStep).toBeUndefined();
  });
});

function setupSecret() {
  process.env.FORTEXA_AUTH_SECRET = "integration-test-secret";
}

function viewerCookie() {
  setupSecret();
  const token = createSessionToken({
    email: "viewer@fortexa.local",
    role: "viewer",
    userId: "submit-viewer-id",
    expiresInSeconds: 120,
  });

  return `${AUTH_COOKIE_KEY}=${token}`;
}

describe("POST /api/stellar/submit-signed authorization", () => {
  it("returns 401 when unauthenticated", async () => {
    const request = new NextRequest("http://localhost/api/stellar/submit-signed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signedXdr: "AAAA" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 403 for viewer role (operator-only route)", async () => {
    const request = new NextRequest("http://localhost/api/stellar/submit-signed", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: viewerCookie(),
      },
      body: JSON.stringify({ signedXdr: "AAAA" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});