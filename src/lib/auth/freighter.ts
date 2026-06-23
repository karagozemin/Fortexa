const STELLAR_PUBLIC_KEY = /^G[A-Z2-7]{55}$/u;

export type FreighterConnectResult =
  | { ok: true; publicKey: string }
  | { ok: false; code: "missing" | "rejected" | "invalid" | "unknown"; message: string };

export async function connectFreighterWallet(): Promise<FreighterConnectResult> {
  try {
    const { requestAccess } = await import("@stellar/freighter-api");
    const access = await requestAccess();

    if (!access.address) {
      return {
        ok: false,
        code: "rejected",
        message: access.error ?? "Freighter connection was cancelled.",
      };
    }

    const publicKey = access.address.trim().toUpperCase();

    if (!STELLAR_PUBLIC_KEY.test(publicKey)) {
      return {
        ok: false,
        code: "invalid",
        message: "Freighter returned an invalid Stellar public key.",
      };
    }

    return { ok: true, publicKey };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not connect to Freighter.";
    const missing = /not installed|no extension|freighter/i.test(message);

    return {
      ok: false,
      code: missing ? "missing" : "unknown",
      message: missing
        ? "Freighter extension not found. Install it from freighter.app and refresh."
        : message,
    };
  }
}

export type FreighterSignErrorCode =
  | "missing"
  | "rejected"
  | "passphrase_mismatch"
  | "invalid_key"
  | "unknown";

export type FreighterSignResult =
  | { ok: true; signedXdr: string; signerAddress: string }
  | { ok: false; code: FreighterSignErrorCode; message: string };

type FreighterApiError = { code?: number; message?: string };

type FreighterSignClient = {
  isConnected: () => Promise<{ isConnected: boolean; error?: FreighterApiError }>;
  getNetwork: () => Promise<{
    network?: string;
    networkPassphrase?: string;
    error?: FreighterApiError;
  }>;
  signTransaction: (
    xdr: string,
    opts?: { networkPassphrase?: string; address?: string }
  ) => Promise<{
    signedTxXdr?: string;
    signerAddress?: string;
    error?: FreighterApiError;
  }>;
};

function isMissingExtensionMessage(message: string) {
  return /not installed|no extension|cannot find|freighter is not|userAgent|undefined.*api/i.test(message);
}

function isUserRejectMessage(message: string) {
  return /reject|cancel|denied|declined|refused/i.test(message);
}

function isPassphraseMismatchMessage(message: string) {
  return /passphrase|network mismatch|wrong network/i.test(message);
}

function categorizeSignError(message: string): FreighterSignErrorCode {
  if (isPassphraseMismatchMessage(message)) return "passphrase_mismatch";
  if (isUserRejectMessage(message)) return "rejected";
  if (isMissingExtensionMessage(message)) return "missing";
  return "unknown";
}

export async function signFreighterXdr(input: {
  unsignedXdr: string;
  expectedNetworkPassphrase: string;
  sourcePublicKey?: string;
  freighter?: FreighterSignClient;
}): Promise<FreighterSignResult> {
  let freighter: FreighterSignClient;
  try {
    freighter = input.freighter ?? ((await import("@stellar/freighter-api")) as unknown as FreighterSignClient);
  } catch {
    return {
      ok: false,
      code: "missing",
      message: "Freighter extension not found. Install it from freighter.app and refresh.",
    };
  }

  try {
    const connection = await freighter.isConnected();
    if (connection.error || !connection.isConnected) {
      return {
        ok: false,
        code: "missing",
        message:
          connection.error?.message ??
          "Freighter is not connected. Install or unlock the extension and refresh.",
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Freighter not detected.";
    return {
      ok: false,
      code: isMissingExtensionMessage(message) ? "missing" : "unknown",
      message: isMissingExtensionMessage(message)
        ? "Freighter extension not found. Install it from freighter.app and refresh."
        : message,
    };
  }

  try {
    const network = await freighter.getNetwork();
    if (!network.error && network.networkPassphrase && network.networkPassphrase !== input.expectedNetworkPassphrase) {
      return {
        ok: false,
        code: "passphrase_mismatch",
        message: `Freighter is on "${network.network ?? "an unknown network"}". Switch the wallet to the expected network and retry.`,
      };
    }
  } catch {
    // Pre-flight network check is best-effort; fall through to signTransaction.
  }

  let signResponse: Awaited<ReturnType<FreighterSignClient["signTransaction"]>>;
  try {
    signResponse = await freighter.signTransaction(input.unsignedXdr, {
      networkPassphrase: input.expectedNetworkPassphrase,
      address: input.sourcePublicKey || undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Freighter signing failed.";
    return { ok: false, code: categorizeSignError(message), message };
  }

  if (signResponse.error) {
    const message = signResponse.error.message || "Freighter signing failed.";
    return { ok: false, code: categorizeSignError(message), message };
  }

  const signedXdr = signResponse.signedTxXdr;
  if (!signedXdr) {
    return { ok: false, code: "rejected", message: "Signing rejected in Freighter. No signed XDR returned." };
  }

  if (
    input.sourcePublicKey &&
    signResponse.signerAddress &&
    signResponse.signerAddress.toUpperCase() !== input.sourcePublicKey.toUpperCase()
  ) {
    return {
      ok: false,
      code: "invalid_key",
      message: `Freighter signed with a different key (${signResponse.signerAddress}) than the linked wallet.`,
    };
  }

  return { ok: true, signedXdr, signerAddress: signResponse.signerAddress ?? "" };
}

export type FreighterSignMessageResult =
  | { ok: true; signature: string; signerAddress: string }
  | { ok: false; code: FreighterSignErrorCode; message: string };

type FreighterMessageClient = {
  isConnected: () => Promise<{ isConnected: boolean; error?: FreighterApiError }>;
  signMessage: (
    message: string,
    opts?: { address?: string }
  ) => Promise<{
    signedMessage?: string | { toString: (encoding: string) => string } | null;
    signerAddress?: string;
    error?: FreighterApiError;
  }>;
};

function normalizeSignedMessage(
  signedMessage: string | { toString: (encoding: string) => string } | null | undefined
) {
  if (!signedMessage) {
    return null;
  }

  if (typeof signedMessage === "string") {
    return signedMessage;
  }

  return signedMessage.toString("base64");
}

export async function signFreighterMessage(input: {
  message: string;
  sourcePublicKey?: string;
  freighter?: FreighterMessageClient;
}): Promise<FreighterSignMessageResult> {
  let freighter: FreighterMessageClient;
  try {
    freighter = input.freighter ?? ((await import("@stellar/freighter-api")) as unknown as FreighterMessageClient);
  } catch {
    return {
      ok: false,
      code: "missing",
      message: "Freighter extension not found. Install it from freighter.app and refresh.",
    };
  }

  try {
    const connection = await freighter.isConnected();
    if (connection.error || !connection.isConnected) {
      return {
        ok: false,
        code: "missing",
        message:
          connection.error?.message ??
          "Freighter is not connected. Install or unlock the extension and refresh.",
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Freighter not detected.";
    return {
      ok: false,
      code: isMissingExtensionMessage(message) ? "missing" : "unknown",
      message: isMissingExtensionMessage(message)
        ? "Freighter extension not found. Install it from freighter.app and refresh."
        : message,
    };
  }

  let signResponse: Awaited<ReturnType<FreighterMessageClient["signMessage"]>>;
  try {
    signResponse = await freighter.signMessage(input.message, {
      address: input.sourcePublicKey || undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Freighter message signing failed.";
    return { ok: false, code: categorizeSignError(message), message };
  }

  if (signResponse.error) {
    const message = signResponse.error.message || "Freighter message signing failed.";
    return { ok: false, code: categorizeSignError(message), message };
  }

  const signature = normalizeSignedMessage(signResponse.signedMessage);
  if (!signature) {
    return {
      ok: false,
      code: "rejected",
      message: "Signing rejected in Freighter. No signature returned.",
    };
  }

  if (
    input.sourcePublicKey &&
    signResponse.signerAddress &&
    signResponse.signerAddress.toUpperCase() !== input.sourcePublicKey.toUpperCase()
  ) {
    return {
      ok: false,
      code: "invalid_key",
      message: `Freighter signed with a different key (${signResponse.signerAddress}) than the linked wallet.`,
    };
  }

  return {
    ok: true,
    signature,
    signerAddress: signResponse.signerAddress ?? "",
  };
}

export type LoginWithFreighterStep =
  | "connecting"
  | "challenge"
  | "signing"
  | "verifying";

export async function loginWithFreighter(options?: {
  onStep?: (step: LoginWithFreighterStep) => void;
}): Promise<
  | { ok: true; role: string; wallet: string }
  | { ok: false; message: string; retryAfterSeconds?: number }
> {
  options?.onStep?.("connecting");
  const connected = await connectFreighterWallet();
  if (!connected.ok) {
    return { ok: false, message: connected.message };
  }

  options?.onStep?.("challenge");
  const challengeResponse = await fetch("/api/auth/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicKey: connected.publicKey }),
  });

  const challengePayload = (await challengeResponse.json()) as {
    error?: string;
    challengeId?: string;
    message?: string;
  };

  if (!challengeResponse.ok || !challengePayload.challengeId || !challengePayload.message) {
    return {
      ok: false,
      message: challengePayload.error ?? "Could not create login challenge.",
    };
  }

  options?.onStep?.("signing");
  const signed = await signFreighterMessage({
    message: challengePayload.message,
    sourcePublicKey: connected.publicKey,
  });

  if (!signed.ok) {
    return { ok: false, message: signed.message };
  }

  options?.onStep?.("verifying");
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: connected.publicKey,
      challengeId: challengePayload.challengeId,
      signature: signed.signature,
    }),
  });

  const payload = (await response.json()) as {
    error?: string;
    role?: string;
    wallet?: string;
    retryAfterSeconds?: number;
  };

  if (!response.ok || payload.error) {
    return {
      ok: false,
      message: payload.error ?? "Sign in failed.",
      retryAfterSeconds: payload.retryAfterSeconds,
    };
  }

  return {
    ok: true,
    role: payload.role ?? "operator",
    wallet: payload.wallet ?? connected.publicKey,
  };
}
