/**
 * @file lib/rate-limiter.ts
 *
 * In-memory sliding window rate limiter.
 * Used for public API key rate limiting.
 *
 * For production scale, replace the in-memory store with Redis or Upstash.
 * The interface is the same — swap the store implementation only.
 * TODO(phase-9): upgrade to Upstash Redis for multi-instance production use.
 */

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
};

type WindowEntry = {
  timestamps: number[];
};

const windows = new Map<string, WindowEntry>();

/**
 * Checks and records a rate limit hit.
 *
 * @param key - Unique identifier (e.g. `apikey:{id}:orders`)
 * @param limit - Max requests per window
 * @param windowMs - Window size in milliseconds (default: 60_000 = 1 minute)
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60_000,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const entry = windows.get(key) ?? { timestamps: [] };
  const timestamps = entry.timestamps.filter((stamp) => stamp > cutoff);

  if (timestamps.length >= limit) {
    windows.set(key, { timestamps });
    const oldest = timestamps[0] ?? now;
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: new Date(oldest + windowMs),
    };
  }

  timestamps.push(now);
  windows.set(key, { timestamps });
  const oldest = timestamps[0] ?? now;
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - timestamps.length),
    resetAt: new Date(oldest + windowMs),
  };
}

/**
 * Clears the in-memory store. Tests only.
 */
export function resetRateLimitStore(): void {
  windows.clear();
}
