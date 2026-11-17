import type { DbClient } from '@/lib/supabase/query';

/**
 * Rate limits backed by rate_limit_hits.
 * bump_rate_limit takes a row lock, so two instances share one count.
 * Tests keep the in-memory store. Auth and money fail closed. Reads fail open.
 */

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
};

export type RateLimitFail = 'closed' | 'open';

export type RateLimitDecision = RateLimitResult & {
  readonly needsMigration: boolean;
  readonly degraded: boolean;
};

export type RateLimitBump = (bucket: string, windowStart: Date) => Promise<number>;

const memory = new Map<string, number>();
let bumpOverride: RateLimitBump | null = null;

function windowStart(now: number, windowMs: number): Date {
  return new Date(Math.floor(now / windowMs) * windowMs);
}

function memoryBump(bucket: string, start: Date): number {
  const key = `${bucket}\n${start.toISOString()}`;
  const next = (memory.get(key) ?? 0) + 1;
  memory.set(key, next);
  return next;
}

function decision(count: number, limit: number, start: Date, windowMs: number, extra?: { needsMigration?: boolean; degraded?: boolean }): RateLimitDecision {
  const allowed = count <= limit;
  return {
    allowed,
    limit,
    remaining: allowed ? Math.max(0, limit - count) : 0,
    resetAt: new Date(start.getTime() + windowMs),
    needsMigration: extra?.needsMigration === true,
    degraded: extra?.degraded === true,
  };
}

function denied(limit: number, start: Date, windowMs: number, needsMigration: boolean): RateLimitDecision {
  return {
    allowed: false,
    limit,
    remaining: 0,
    resetAt: new Date(start.getTime() + windowMs),
    needsMigration,
    degraded: true,
  };
}

function allowedOpen(limit: number, start: Date, windowMs: number, needsMigration: boolean): RateLimitDecision {
  return {
    allowed: true,
    limit,
    remaining: limit,
    resetAt: new Date(start.getTime() + windowMs),
    needsMigration,
    degraded: true,
  };
}

export function isMissingRateLimitStore(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes('bump_rate_limit')
    || message.includes('rate_limit_hits')
    || message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('pgrst202')
    || message.includes('42883')
    || message.includes('42p01')
  );
}

function memoryStoreEnabled(): boolean {
  return bumpOverride === null && (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.RATE_LIMIT_MEMORY === '1');
}

async function remoteBump(bucket: string, start: Date): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('rate limit store unavailable');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(`${url}/rest/v1/rpc/bump_rate_limit`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_bucket: bucket.slice(0, 200), p_window_start: start.toISOString() }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || `rate limit store ${response.status}`);
    }
    const parsed = JSON.parse(text) as unknown;
    const count = typeof parsed === 'number' ? parsed : Number(parsed);
    if (!Number.isFinite(count)) {
      throw new Error('invalid rate limit count');
    }
    return count;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Records one hit and returns whether it is still inside the limit.
 * A shared bump function is one table seen by every instance.
 */
export async function consumeRateLimit(input: {
  readonly key: string;
  readonly limit: number;
  readonly windowMs?: number;
  readonly fail: RateLimitFail;
  readonly now?: number;
}): Promise<RateLimitDecision> {
  const windowMs = input.windowMs ?? 60_000;
  const start = windowStart(input.now ?? Date.now(), windowMs);
  const bucket = input.key.slice(0, 200);
  try {
    const count = bumpOverride
      ? await bumpOverride(bucket, start)
      : memoryStoreEnabled()
        ? memoryBump(bucket, start)
        : await remoteBump(bucket, start);
    return decision(count, input.limit, start, windowMs);
  } catch (error: unknown) {
    const needsMigration = isMissingRateLimitStore(error);
    if (input.fail === 'open') return allowedOpen(input.limit, start, windowMs, needsMigration);
    return denied(input.limit, start, windowMs, needsMigration);
  }
}

/**
 * In-memory fixed window. Tests call this directly. Production routes use consumeRateLimit.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number = 60_000): RateLimitResult {
  const start = windowStart(Date.now(), windowMs);
  const count = memoryBump(key.slice(0, 200), start);
  const result = decision(count, limit, start, windowMs);
  return { allowed: result.allowed, limit: result.limit, remaining: result.remaining, resetAt: result.resetAt };
}

/**
 * Points every consumeRateLimit call at one shared store. Pass null to restore the default.
 */
export function setRateLimitBump(bump: RateLimitBump | null): void {
  bumpOverride = bump;
}

/**
 * Clears the in-memory store and any test bump. Tests only.
 */
export function resetRateLimitStore(): void {
  memory.clear();
  bumpOverride = null;
}

/**
 * Deletes rate-limit rows older than two days. The caller catches errors.
 */
export async function sweepRateLimitHits(db: DbClient, now = Date.now()): Promise<void> {
  const cutoff = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const result = (await db.from('rate_limit_hits').delete().lte('window_start', cutoff)) as { error: { message: string } | null };
  if (result.error) {
    throw new Error(result.error.message);
  }
}
