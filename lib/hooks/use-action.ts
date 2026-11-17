/**
 * @file lib/hooks/use-action.ts
 *
 * Writes go through this helper so a page never calls fetch itself.
 */

import { parseData, type DataError } from '@/lib/hooks/parse-data';

export async function runAction<T = unknown>(url: string, init?: { readonly method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; readonly body?: unknown }): Promise<{ ok: true; data: T } | { ok: false; error: DataError }> {
  try {
    const headers = init?.body !== undefined ? { 'content-type': 'application/json' } : undefined;
    const response = await fetch(url, {
      method: init?.method ?? 'POST',
      ...(headers ? { headers } : {}),
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const payload: unknown = await response.json().catch(() => null);
    const parsed = parseData<unknown>(response.status, payload);
    if (!parsed.ok) {
      return parsed;
    }
    return { ok: true, data: parsed.data as T };
  } catch (cause: unknown) {
    const message = cause instanceof Error && cause.message.length > 0
      ? cause.message
      : 'The request failed. Check the connection and try again.';
    return { ok: false, error: { message, code: 'NETWORK' } };
  }
}
