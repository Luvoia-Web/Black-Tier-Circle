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
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type TenantRow = {
  readonly id: string;
  readonly owner_user_id: string;
  readonly display_name: string;
  readonly business_name: string | null;
  readonly support_contact: string | null;
  readonly status: AccountStatus;
  readonly created_at: string;
  readonly updated_at: string;
};

export type ResellerListItem = {
  readonly tenantId: string;
  readonly displayName: string;
  readonly email: string;
  readonly tenantName: string;
  readonly status: AccountStatus;
  readonly profileStatus: AccountStatus;
  readonly joinedAt: Date;
};
