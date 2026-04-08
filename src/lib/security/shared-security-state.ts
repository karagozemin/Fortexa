import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

type SharedRateLimitState = {
  count: number;
  resetAt: number;
};

type SharedLockoutState = {
  attempts: number;
  lockedUntilMs: number;
};

type SharedSecurityState = {
  rateLimits: Record<string, SharedRateLimitState>;
  lockouts: Record<string, SharedLockoutState>;
};

const defaultState: SharedSecurityState = {
  rateLimits: {},
  lockouts: {},
};

function getSharedStatePath() {
  const configured = process.env.FORTEXA_SHARED_STATE_PATH?.trim();
  if (!configured) {
    return null;
  }

  if (path.isAbsolute(configured)) {
    return configured;
  }

  const relativeBase = process.env.VERCEL === "1" ? "/tmp" : process.cwd();
  return path.join(relativeBase, configured);
}

export function isSharedSecurityStateEnabled() {
  return Boolean(getSharedStatePath());
}

function readSharedState(): SharedSecurityState {
  const filePath = getSharedStatePath();
  if (!filePath) {
    return defaultState;
  }

  try {
    if (!existsSync(filePath)) {
      return defaultState;
    }

    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<SharedSecurityState>;

    return {
      rateLimits: parsed.rateLimits ?? {},
      lockouts: parsed.lockouts ?? {},
    };
  } catch {
    return defaultState;
  }
}

function writeSharedState(next: SharedSecurityState) {
  const filePath = getSharedStatePath();
  if (!filePath) {
    return;
  }

  mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  writeFileSync(tempPath, JSON.stringify(next, null, 2), "utf8");
  renameSync(tempPath, filePath);
}

export function readSharedRateLimit(key: string) {
  return readSharedState().rateLimits[key];
}

export function writeSharedRateLimit(key: string, value: SharedRateLimitState) {
  const current = readSharedState();
  current.rateLimits[key] = value;
  writeSharedState(current);
}

export function clearSharedRateLimits() {
  const current = readSharedState();
  current.rateLimits = {};
  writeSharedState(current);
}

export function readSharedLockout(key: string) {
  return readSharedState().lockouts[key];
}

export function writeSharedLockout(key: string, value: SharedLockoutState) {
  const current = readSharedState();
  current.lockouts[key] = value;
  writeSharedState(current);
}

export function removeSharedLockout(key: string) {
  const current = readSharedState();
  delete current.lockouts[key];
  writeSharedState(current);
}

export function clearSharedLockouts() {
  const current = readSharedState();
  current.lockouts = {};
  writeSharedState(current);
}

export function clearSharedSecurityStateFile() {
  const filePath = getSharedStatePath();
  if (!filePath) {
    return;
  }

  rmSync(filePath, { force: true });
}
