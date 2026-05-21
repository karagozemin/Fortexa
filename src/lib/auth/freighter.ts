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

export async function loginWithFreighter(): Promise<
  | { ok: true; role: string; wallet: string }
  | { ok: false; message: string; retryAfterSeconds?: number }
> {
  const connected = await connectFreighterWallet();
  if (!connected.ok) {
    return { ok: false, message: connected.message };
  }

  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicKey: connected.publicKey }),
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
