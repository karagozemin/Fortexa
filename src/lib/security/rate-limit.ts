import type { NextRequest } from "next/server";

type BucketConfig = {
  key: string;
  limit: number;
  windowMs: number;
};

type BucketState = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

const buckets = new Map<string, BucketState>();

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }

  const realIp = request.headers.get("x-real-ip");
  return realIp?.trim() || "unknown";
}

export function consumeRateLimit(request: NextRequest, config: BucketConfig): RateLimitResult {
  const now = Date.now();
  const ip = getClientIp(request);
  const bucketKey = `${config.key}:${ip}`;

  const current = buckets.get(bucketKey);

  if (!current || now >= current.resetAt) {
    const fresh: BucketState = {
      count: 1,
      resetAt: now + config.windowMs,
    };

    buckets.set(bucketKey, fresh);

    return {
      ok: true,
      limit: config.limit,
      remaining: Math.max(0, config.limit - 1),
      retryAfterSeconds: 0,
      resetAt: fresh.resetAt,
    };
  }

  if (current.count >= config.limit) {
    return {
      ok: false,
      limit: config.limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      resetAt: current.resetAt,
    };
  }

  current.count += 1;
  buckets.set(bucketKey, current);

  return {
    ok: true,
    limit: config.limit,
    remaining: Math.max(0, config.limit - current.count),
    retryAfterSeconds: 0,
    resetAt: current.resetAt,
  };
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
    "Retry-After": String(result.retryAfterSeconds),
  };
}
