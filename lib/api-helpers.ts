/**
 * @file lib/api-helpers.ts
 *
 * JSON serialization helpers for API responses that include bigint money fields.
 *
 * @module ApiHelpers
 */

/**
 * Serializes an object for JSON response, converting bigint fields to strings.
 * Use this on any object containing money amounts before returning from API routes.
 *
 * @param obj - Value that may contain bigint fields
 * @returns JSON-safe structure with bigint values as strings
 */
export function serializeForJson<T>(obj: T): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value)),
  );
}
