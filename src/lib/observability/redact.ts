const SENSITIVE_KEYS = new Set([
  "signature",
  "signedxdr",
  "xdr",
  "authorization",
  "cookie",
  "fortexa_session",
  "groq_api_key",
  "secret",
  "token",
]);

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

export function redactSensitiveFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveFields) as unknown as T;
  }

  if (value !== null && typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        redacted[key] = "[REDACTED]";
      } else {
        redacted[key] = redactSensitiveFields(val);
      }
    }
    return redacted as T;
  }

  return value;
}
