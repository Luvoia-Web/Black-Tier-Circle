/**
 * @file lib/hooks/use-data.ts
 *
 * The one data hook the new pages use. It aborts on unmount, surfaces a typed
 * error, and always leaves loading when the request ends.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { parseData, type DataError } from '@/lib/hooks/parse-data';

export type { DataError };

export type DataState<T> = {
  readonly data: T | null;
  readonly loading: boolean;
  readonly error: DataError | null;
  readonly refetch: () => void;
};

/**
 * Loads JSON from `url`. Pass null to stay idle.
 *
 * @param url - Request URL, or null when the page is not ready to load
 */
export function useData<T>(url: string | null): DataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(url !== null);
  const [error, setError] = useState<DataError | null>(null);
  const [attempt, setAttempt] = useState(0);

  const refetch = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    if (url === null) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    setLoading(true);
    setError(null);
    void fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (controller.signal.aborted) {
          return;
        }
        const parsed = parseData<T>(response.status, payload);
        if (parsed.ok) {
          setData(parsed.data);
          setError(null);
        } else {
          setError(parsed.error);
        }
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        const aborted = cause instanceof Error && cause.name === 'AbortError';
        const message = aborted
          ? 'This is taking too long. Try again.'
          : cause instanceof Error && cause.message.length > 0
            ? cause.message
            : 'The request failed. Check the connection and try again.';
        setError({ message, code: aborted ? 'TIMEOUT' : 'NETWORK' });
        setLoading(false);
      });
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [url, attempt]);

  return { data, loading, error, refetch };
}
