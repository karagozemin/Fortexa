import { describe, expect, it, vi } from "vitest";

import { signFreighterMessage } from "@/lib/auth/freighter";

type FreighterMessageTestClient = Parameters<typeof signFreighterMessage>[0]["freighter"];

function freighterMessageMock(overrides?: {
  isConnected?: ReturnType<typeof vi.fn>;
  signMessage?: ReturnType<typeof vi.fn>;
}): NonNullable<FreighterMessageTestClient> & {
  isConnected: ReturnType<typeof vi.fn>;
  signMessage: ReturnType<typeof vi.fn>;
} {
  return {
    isConnected:
      overrides?.isConnected ?? vi.fn().mockResolvedValue({ isConnected: true }),
    signMessage:
      overrides?.signMessage ??
      vi.fn().mockResolvedValue({
        signedMessage: "c2lnbmF0dXJl",
        signerAddress: "GABC",
      }),
  } as never;
}

describe("signFreighterMessage", () => {
  it("returns ok with base64 signature on success", async () => {
    const result = await signFreighterMessage({
      message: "Fortexa wallet login",
      freighter: freighterMessageMock(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signature).toBe("c2lnbmF0dXJl");
      expect(result.signerAddress).toBe("GABC");
    }
  });

  it("flags user rejection when no signature is returned", async () => {
    const freighter = freighterMessageMock({
      signMessage: vi.fn().mockResolvedValue({ signedMessage: null, signerAddress: "" }),
    });

    const result = await signFreighterMessage({
      message: "Fortexa wallet login",
      freighter,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("rejected");
    }
  });
});
