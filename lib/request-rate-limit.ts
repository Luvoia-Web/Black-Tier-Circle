/**
 * @file lib/request-rate-limit.ts
 *
 * HTTP rate limiting helpers for dashboard and public endpoints.
 *
 * @module RateLimit
 */

import { AppError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rate-limiter';

/**
 * Best-effort client IP from proxy headers.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Throws 429 when the sliding window is exhausted.
 *
 * @param key - Unique limiter key
 * @param limit - Max hits per window
 * @param windowMs - Window size
 */
export function assertRateLimit(key: string, limit: number, windowMs: number = 60_000): void {
  const result = checkRateLimit(key, limit, windowMs);
  if (!result.allowed) {
    throw new AppError('RATE_LIMITED', 'Too many requests. Please wait and try again.', 429);
  }
}
