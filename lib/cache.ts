/**
 * @file lib/cache.ts
 *
 * In-memory cache for serverless instances. Data that rarely changes
 * (platform settings, published products) is cached per-instance.
 *
 * NOTE: Cache is not shared across Vercel instances. Keep TTLs short.
 *
 * @module Cache
 */

type CacheEntry<T> = { readonly data: T; readonly expiresAt: number };

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Returns a cached value when present and unexpired.
 */
export function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Stores a value until ttlMs elapses.
 */
export function setCached<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/**
 * Drops every key that starts with the given prefix.
 */
export function invalidateCache(keyPrefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Returns cached data or runs the fetcher and stores the result.
 */
export async function withCache<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV === 'test') {
    return fetcher();
  }
  const cached = getCached<T>(key);
  if (cached !== null) {
    return cached;
  }
  const data = await fetcher();
  setCached(key, data, ttlMs);
  return data;
}
