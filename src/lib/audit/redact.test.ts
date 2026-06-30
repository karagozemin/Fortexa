import { describe, expect, it } from "vitest";

import { redactAuditExportPayload } from "@/lib/audit/redact";

describe("audit export redaction", () => {
  it("redacts nested session keys", () => {
    const input = {
      sessionKey: "abc123",
      ok: true,
      nested: {
        wallet_session: "wallet-secret",
      },
    };

    const out = redactAuditExportPayload(input);
    expect(out.sessionKey).toEqual({ $redacted: "session" });
    expect(out.nested.wallet_session).toEqual({ $redacted: "session" });
    expect(out.ok).toBe(true);
  });

  it("redacts tokens in arrays and by value heuristics", () => {
    const input = {
      list: [
        { bearer: "Bearer eyJhbGciOi..." },
        { other: "not-secret" },
        { auth: "secret" },
      ],
    };

    const out = redactAuditExportPayload(input);
    expect(out.list[0]).toEqual({ bearer: { $redacted: "token" } });
    expect(out.list[1]).toEqual({ other: "not-secret" });
    expect(out.list[2]).toEqual({ auth: { $redacted: "token" } });
  });

  it("redacts signed XDR-like values", () => {
    const signedXdr =
      "XDR: AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const input = {
      signedXdr,
      memo: "keep-memo",
    };

    const out = redactAuditExportPayload(input);
    expect(out.signedXdr).toEqual({ $redacted: "signed_xdr" });
    expect(out.memo).toBe("keep-memo");
  });

  it("preserves allowlisted decision evidence fields", () => {
    const input = {
      decision: "APPROVE",
      horizonResultCode: "tx_success",
      triggeredPolicies: ["POLICY_X"],
      riskFindings: ["none"],
      previousHash: "prev",
      entryHash: "hash",
    };

    const out = redactAuditExportPayload(input);
    expect(out.decision).toBe("APPROVE");
    expect(out.horizonResultCode).toBe("tx_success");
    expect(out.triggeredPolicies).toEqual(["POLICY_X"]);
    expect(out.riskFindings).toEqual(["none"]);
    expect(out.previousHash).toBe("prev");
    expect(out.entryHash).toBe("hash");
  });

  it("redacts unknown sensitive keys matched by pattern", () => {
    const input = {
      access_token: "super-secret",
      weird: {
        authorization: "Bearer abc",
      },
    };

    const out = redactAuditExportPayload(input);
    expect(out.access_token).toEqual({ $redacted: "token" });
    expect(out.weird.authorization).toEqual({ $redacted: "token" });
  });

  it("redacts JWT-shaped values even when the key is benign", () => {
    // Three base64url-style segments separated by dots, no sensitive key.
    const jwtLike =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const input = {
      note: "carried through",
      payload: jwtLike,
      nested: { tokenless: jwtLike },
    };

    const out = redactAuditExportPayload(input);
    expect(out.note).toBe("carried through");
    // A JWT-shaped value is long base64-ish, so the implementation may classify
    // it as either "token" or "signed_xdr". The exact reason is not important;
    // what matters is that the raw token is never leaked in the export.
    expect(out.payload).toMatchObject({ $redacted: expect.any(String) });
    expect(JSON.stringify(out.payload)).not.toContain(jwtLike);
    expect(out.nested.tokenless).toMatchObject({ $redacted: expect.any(String) });
    expect(JSON.stringify(out.nested.tokenless)).not.toContain(jwtLike);
  });

  it("redacts long base64-ish values under a benign key as signed XDR", () => {
    const longXdr =
      "AAAAAGL8HXc5MUR2PZz5bg5qJV8J8e8b5Z6c5m6XQp1G2VxQYwQf9L8m2k3pL9H8RqVQ5p3zYb0wQjK9VxQYwQf9L8m2k3pL9H8R";
    const input = {
      payload: longXdr,
      safe: "short value",
    };

    const out = redactAuditExportPayload(input);
    expect(out.payload).toEqual({ $redacted: "signed_xdr" });
    expect(out.safe).toBe("short value");
  });

  it("keeps the redaction reason granular for session vs token vs signed_xdr", () => {
    const input = {
      sessionId: "abc",
      accessToken: "xyz",
      signedXdr: "XDR: AAAA",
    };
    const out = redactAuditExportPayload(input);
    expect(out.sessionId).toEqual({ $redacted: "session" });
    expect(out.accessToken).toEqual({ $redacted: "token" });
    expect(out.signedXdr).toEqual({ $redacted: "signed_xdr" });
  });
});
