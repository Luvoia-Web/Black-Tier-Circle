/**
 * @file modules/public-api/index.ts
 *
 * Public reseller API surface. Routes land in Phase 7.
 *
 * @module PublicApi
 */

import type { PublicApiKey } from './types';

export type { PublicApiKey, PublicApiKeyStatus } from './types';

/**
 * Phase 0 stub: public API keys are not issued yet.
 *
 * @returns Empty list
 */
export function listPublicApiKeys(): readonly PublicApiKey[] {
  return [];
}
