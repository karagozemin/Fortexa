import {
  clearSharedLockouts,
  isSharedSecurityStateEnabled,
  readSharedLockout,
  removeSharedLockout,
  writeSharedLockout,
} from "@/lib/security/shared-security-state";

type LockoutRecord = {
  attempts: number;
  lockedUntilMs: number;
};

const records = new Map<string, LockoutRecord>();

function getMaxAttempts() {
  const parsed = Number(process.env.FORTEXA_AUTH_MAX_ATTEMPTS ?? 5);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 5;
  }
  return Math.floor(parsed);
}

function getLockMinutes() {
  const parsed = Number(process.env.FORTEXA_AUTH_LOCK_MINUTES ?? 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }
  return parsed;
}

function keyOf(email: string, ip: string) {
  return `${email.trim().toLowerCase()}::${ip}`;
}

export function readClientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }

  return headers.get("x-real-ip")?.trim() ?? "unknown";
}

export function isLoginLocked(email: string, ip: string) {
  const key = keyOf(email, ip);
  const useSharedState = isSharedSecurityStateEnabled();
  const record = useSharedState ? readSharedLockout(key) : records.get(key);

  if (!record) {
    return { locked: false as const, retryAfterSeconds: 0 };
  }

  const now = Date.now();
  if (record.lockedUntilMs <= now) {
    if (useSharedState) {
      removeSharedLockout(key);
    } else {
      records.delete(key);
    }
    return { locked: false as const, retryAfterSeconds: 0 };
  }

  return {
    locked: true as const,
    retryAfterSeconds: Math.max(1, Math.ceil((record.lockedUntilMs - now) / 1000)),
  };
}

export function registerLoginFailure(email: string, ip: string) {
  const now = Date.now();
  const maxAttempts = getMaxAttempts();
  const lockMs = Math.max(1000, getLockMinutes() * 60 * 1000);
  const useSharedState = isSharedSecurityStateEnabled();

  const key = keyOf(email, ip);
  const current = (useSharedState ? readSharedLockout(key) : records.get(key)) ?? {
    attempts: 0,
    lockedUntilMs: 0,
  };
  current.attempts += 1;

  if (current.attempts >= maxAttempts) {
    current.lockedUntilMs = now + lockMs;
  }

  if (useSharedState) {
    writeSharedLockout(key, current);
  } else {
    records.set(key, current);
  }

  return {
    attempts: current.attempts,
    lockedUntilMs: current.lockedUntilMs,
    justLocked: current.lockedUntilMs > now,
  };
}

export function clearLoginFailures(email: string, ip: string) {
  const key = keyOf(email, ip);
  if (isSharedSecurityStateEnabled()) {
    removeSharedLockout(key);
    return;
  }

  records.delete(key);
}

export function resetLoginLockoutStore() {
  records.clear();
  if (isSharedSecurityStateEnabled()) {
    clearSharedLockouts();
  }
}
