/**
 * @file modules/tenants/types.ts
 *
 * Tenant (reseller account) types.
 *
 * @module Tenants
 */

import type { AccountStatus } from '@/modules/identity';

export type Tenant = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly displayName: string;
  readonly businessName: string | null;
  readonly supportContact: string | null;
  readonly status: AccountStatus;
};
