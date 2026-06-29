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
});
