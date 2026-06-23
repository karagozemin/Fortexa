import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import Redis from "ioredis";

export type SharedRateLimitState = {
  count: number;
  resetAt: number;
};

export type SharedLockoutState = {
  attempts: number;
  lockedUntilMs: number;
};

export type SharedChallengeState = {
  publicKey: string;
  message: string;
  expiresAtMs: number;
  consumed: boolean;
};

type SharedSecurityState = {
  rateLimits: Record<string, SharedRateLimitState>;
  lockouts: Record<string, SharedLockoutState>;
  challenges: Record<string, SharedChallengeState>;
};

const defaultState: SharedSecurityState = {
  rateLimits: {},
  lockouts: {},
  challenges: {},
};

let redisClient: Redis | null = null;
let isRedisUnreachable = false;

function getRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    return null;
  }

  if (!redisClient) {
    try {
      redisClient = new Redis(redisUrl, {
        connectTimeout: 1000,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
      });

      redisClient.on("error", (err) => {
        console.error("Redis connection error:", err);
        isRedisUnreachable = true;
      });

      redisClient.on("connect", () => {
        isRedisUnreachable = false;
      });
    } catch (err) {
      console.error("Failed to initialize Redis client:", err);
      isRedisUnreachable = true;
    }
  }

  return redisClient;
}

export function resetRedisClient() {
  if (redisClient) {
    try {
      redisClient.disconnect();
    } catch {
      // ignore
    }
    redisClient = null;
  }
  isRedisUnreachable = false;
}

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
  return Boolean(process.env.REDIS_URL?.trim()) || Boolean(getSharedStatePath());
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
      challenges: parsed.challenges ?? {},
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

async function runWithRedisFallback<T>(
  redisOp: (client: Redis) => Promise<T>,
  fileOp: () => T
): Promise<T> {
  const client = getRedisClient();
  if (client && !isRedisUnreachable) {
    try {
      return await redisOp(client);
    } catch (error) {
      console.warn("Redis operation failed, falling back to file store:", error);
    }
  }
  return fileOp();
}

export async function readSharedRateLimit(key: string): Promise<SharedRateLimitState | undefined> {
  return runWithRedisFallback(
    async (client) => {
      const redisKey = `fortexa:rate-limit:${key}`;
      const raw = await client.get(redisKey);
      if (!raw) {
        return undefined;
      }
      return JSON.parse(raw) as SharedRateLimitState;
    },
    () => readSharedState().rateLimits[key]
  );
}

export async function writeSharedRateLimit(key: string, value: SharedRateLimitState): Promise<void> {
  await runWithRedisFallback(
    async (client) => {
      const redisKey = `fortexa:rate-limit:${key}`;
      const now = Date.now();
      const ttlSeconds = Math.max(1, Math.ceil((value.resetAt - now) / 1000));
      await client.set(redisKey, JSON.stringify(value), "EX", ttlSeconds);
    },
    () => {
      const current = readSharedState();
      current.rateLimits[key] = value;
      writeSharedState(current);
    }
  );
}

export async function clearSharedRateLimits(): Promise<void> {
  await runWithRedisFallback(
    async (client) => {
      const keys = await client.keys("fortexa:rate-limit:*");
      if (keys.length > 0) {
        await client.del(keys);
      }
    },
    () => {
      const current = readSharedState();
      current.rateLimits = {};
      writeSharedState(current);
    }
  );
}

export async function readSharedLockout(key: string): Promise<SharedLockoutState | undefined> {
  return runWithRedisFallback(
    async (client) => {
      const redisKey = `fortexa:lockout:${key}`;
      const raw = await client.get(redisKey);
      if (!raw) {
        return undefined;
      }
      return JSON.parse(raw) as SharedLockoutState;
    },
    () => readSharedState().lockouts[key]
  );
}

export async function writeSharedLockout(key: string, value: SharedLockoutState): Promise<void> {
  await runWithRedisFallback(
    async (client) => {
      const redisKey = `fortexa:lockout:${key}`;
      const now = Date.now();
      let ttlSeconds = 86400; // 24 hours fallback
      if (value.lockedUntilMs > now) {
        ttlSeconds = Math.max(1, Math.ceil((value.lockedUntilMs - now) / 1000));
      }
      await client.set(redisKey, JSON.stringify(value), "EX", ttlSeconds);
    },
    () => {
      const current = readSharedState();
      current.lockouts[key] = value;
      writeSharedState(current);
    }
  );
}

export async function removeSharedLockout(key: string): Promise<void> {
  await runWithRedisFallback(
    async (client) => {
      const redisKey = `fortexa:lockout:${key}`;
      await client.del(redisKey);
    },
    () => {
      const current = readSharedState();
      delete current.lockouts[key];
      writeSharedState(current);
    }
  );
}

export async function clearSharedLockouts(): Promise<void> {
  await runWithRedisFallback(
    async (client) => {
      const keys = await client.keys("fortexa:lockout:*");
      if (keys.length > 0) {
        await client.del(keys);
      }
    },
    () => {
      const current = readSharedState();
      current.lockouts = {};
      writeSharedState(current);
    }
  );
}

export async function readSharedChallenge(key: string): Promise<SharedChallengeState | undefined> {
  return runWithRedisFallback(
    async (client) => {
      const redisKey = `fortexa:challenge:${key}`;
      const raw = await client.get(redisKey);
      if (!raw) {
        return undefined;
      }
      return JSON.parse(raw) as SharedChallengeState;
    },
    () => readSharedState().challenges[key]
  );
}

export async function writeSharedChallenge(
  key: string,
  value: SharedChallengeState,
  ttlSeconds: number
): Promise<void> {
  await runWithRedisFallback(
    async (client) => {
      const redisKey = `fortexa:challenge:${key}`;
      await client.set(redisKey, JSON.stringify(value), "EX", Math.max(1, ttlSeconds));
    },
    () => {
      const current = readSharedState();
      current.challenges[key] = value;
      writeSharedState(current);
    }
  );
}

export async function deleteSharedChallenge(key: string): Promise<void> {
  await runWithRedisFallback(
    async (client) => {
      const redisKey = `fortexa:challenge:${key}`;
      await client.del(redisKey);
    },
    () => {
      const current = readSharedState();
      delete current.challenges[key];
      writeSharedState(current);
    }
  );
}

export async function clearSharedChallenges(): Promise<void> {
  await runWithRedisFallback(
    async (client) => {
      const keys = await client.keys("fortexa:challenge:*");
      if (keys.length > 0) {
        await client.del(keys);
      }
    },
    () => {
      const current = readSharedState();
      current.challenges = {};
      writeSharedState(current);
    }
  );
}

export async function clearSharedSecurityStateFile(): Promise<void> {
  const filePath = getSharedStatePath();
  if (filePath) {
    try {
      rmSync(filePath, { force: true });
    } catch (err) {
      console.error("Failed to delete shared state file:", err);
    }
  }

  const client = getRedisClient();
  if (client && !isRedisUnreachable) {
    try {
      const keys = await client.keys("fortexa:*");
      if (keys.length > 0) {
        await client.del(keys);
      }
    } catch (err) {
      console.warn("Failed to clear Redis keys in clearSharedSecurityStateFile:", err);
    }
  }
}
