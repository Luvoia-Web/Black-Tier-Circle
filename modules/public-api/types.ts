/**
 * @file modules/public-api/types.ts
 *
 * Public reseller API types reserved for Phase 7.
 *
 * @module PublicApi
 */

export type PublicApiKeyStatus = 'active' | 'revoked';

export type PublicApiKey = {
  readonly id: string;
  readonly tenantId: string;
  readonly prefix: string;
  readonly status: PublicApiKeyStatus;
};
