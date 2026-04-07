const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/u;

export function getWalletFromSession(session: { userId?: string; email?: string }) {
  const candidates = [session.userId, session.email]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => value.replace(/^wallet:/u, "").trim().toUpperCase());

  for (const candidate of candidates) {
    if (STELLAR_PUBLIC_KEY_REGEX.test(candidate)) {
      return candidate;
    }
  }

  return null;
}
