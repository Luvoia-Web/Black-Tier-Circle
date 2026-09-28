/**
 * @file lib/intelligence-session.ts
 *
 * Session resolution for MemoryOS routes.
 * Tenant id always comes from the authenticated user, never the request body.
 *
 * @module Intelligence
 */

import { asDbClient, requireReseller, requireRole } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import type { DbClient } from '@/lib/supabase/query';
import { getBotConnection, listCustomers } from '@/modules/bots';
import { listOrders } from '@/modules/orders';
import { getTenantByUserId } from '@/modules/tenants';

export type MemorySession = {
  readonly tenantId: string;
  readonly userId: string;
  readonly db: DbClient;
};

/**
 * Reseller session. Tenant id is loaded from the database for this user.
 */
export async function requireResellerMemory(): Promise<MemorySession> {
  const session = await requireReseller();
  return {
    tenantId: session.tenant.id,
    userId: session.user.id,
    db: asDbClient(session.admin),
  };
}

/**
 * Owner or reseller session. Tenant id is loaded from the database for this user.
 */
export async function requireOperatorMemory(): Promise<MemorySession> {
  const session = await requireRole(['owner', 'reseller']);
  const db = asDbClient(session.admin);
  const tenant = await getTenantByUserId(db, session.user.id);
  if (session.profile.role === 'reseller' && tenant.status !== 'active') {
    throw new AuthError(
      tenant.status === 'suspended' ? 'ACCOUNT_SUSPENDED' : 'TENANT_NOT_ACTIVE',
      tenant.status === 'suspended' ? 'This account has been suspended' : 'Reseller account is not active',
      403,
    );
  }
  return { tenantId: tenant.id, userId: session.user.id, db };
}

/**
 * Confirms the customer belongs to the session tenant before memory is written.
 */
export async function assertTenantCustomer(session: MemorySession, customerId: string): Promise<void> {
  const connection = await getBotConnection(session.db, session.tenantId);
  if (connection) {
    const customers = await listCustomers(session.db, connection.id);
    if (customers.some((customer) => customer.id === customerId)) {
      return;
    }
  }
  const orders = await listOrders(session.db, { tenantId: session.tenantId, customerId, limit: 1 });
  if (orders.length > 0) {
    return;
  }
  throw new AuthError('FORBIDDEN', 'Customer is not in your store', 403);
}
