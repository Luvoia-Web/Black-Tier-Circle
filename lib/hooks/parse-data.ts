/**
 * @file lib/hooks/parse-data.ts
 *
 * Turns an API payload into data or a typed error. The hook uses this so a
 * failed response can never leave the caller loading.
 */

export type DataError = {
  readonly message: string;
  readonly code: string;
};

export type ParsedData<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: DataError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads `{ success, data, error }` from a response body.
 *
 * @param status - HTTP status
 * @param payload - Parsed JSON, or null when the body was not JSON
 */
export function parseData<T>(status: number, payload: unknown): ParsedData<T> {
  if (isRecord(payload) && payload.success === true && 'data' in payload) {
    return { ok: true, data: payload.data as T };
  }
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
  const message = typeof error?.message === 'string' && error.message.length > 0
    ? error.message
    : `The request failed (${status}). Try again.`;
  const code = typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED';
  return { ok: false, error: { message, code } };
}
