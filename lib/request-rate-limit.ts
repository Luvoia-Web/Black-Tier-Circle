/**
 * HTTP rate limiting helpers for dashboard and public endpoints.
 */

import { AppError } from '@/lib/errors';
import { consumeRateLimit, type RateLimitFail } from '@/lib/rate-limiter';

/**
 * Best-effort client IP from proxy headers.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function failForKey(key: string, explicit?: RateLimitFail): RateLimitFail {
  if (explicit) return explicit;
  if (key.startsWith('auth:') || key.startsWith('wallet') || key.startsWith('pay-') || key.startsWith('topup')) return 'closed';
  return 'closed';
}

/**
 * Throws 429 when the window is exhausted.
 * Auth and money keys fail closed. A missing rate_limit_hits table says so.
 */
export async function assertRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60_000,
  fail?: RateLimitFail,
): Promise<void> {
  const mode = failForKey(key, fail);
  const result = await consumeRateLimit({ key, limit, windowMs, fail: mode });
  if (!result.allowed) {
    const message = result.needsMigration
      ? 'This action needs migration 0032.'
      : 'Too many requests. Please wait and try again.';
    throw new AppError('RATE_LIMITED', message, 429);
  }
}
