/**
 * @file modules/tenants/index.ts
 *
 * Tenant public API with sandbox records.
 *
 * INVARIANT: tenant IDs used in queries come from session, not request body.
 *
 * @module Tenants
 */

import { TenantError } from '@/lib/errors';
import type { Tenant } from './types';

export type { Tenant } from './types';

const SANDBOX_TENANT: Tenant = {
  id: '00000000-0000-4000-8000-000000000010',
  ownerUserId: '00000000-0000-4000-8000-000000000002',
  displayName: 'Sandbox Reseller',
  businessName: 'Sandbox Notes Co',
  supportContact: 'sandbox@example.test',
  status: 'active',
};

/**
 * Loads a tenant after verifying it matches the session tenant.
 *
 * @param sessionTenantId - Tenant ID derived from the authenticated session
 * @param requestedTenantId - Tenant ID the caller wants to load
 * @returns Sandbox tenant when IDs match
 * @throws TenantError when the caller asks for a different tenant
 */
export function getTenantForSession(sessionTenantId: string, requestedTenantId: string): Tenant {
  if (sessionTenantId !== requestedTenantId) {
    throw new TenantError('TENANT_MISMATCH', 'Tenant scope does not match the session');
  }
  if (requestedTenantId !== SANDBOX_TENANT.id) {
    throw new TenantError('TENANT_NOT_FOUND', 'Unknown tenant in sandbox', 404);
  }
  return SANDBOX_TENANT;
}
