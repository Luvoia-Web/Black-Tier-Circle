/**
 * @file lib/payment-access.ts
 *
 * Authorization helpers for payment API routes.
 *
 * @module Payments
 */

import { AuthError } from '@/lib/errors';
import type { AuthenticatedSession } from '@/lib/auth/session';
import { getTenantByUserId } from '@/modules/tenants';
import type { Order } from '@/modules/orders';
import { asDbClient } from '@/lib/auth/session';

/**
 * Ensures the session may act on this order (owner any, reseller own tenant).
 *
 * @param session - Authenticated session
 * @param order - Loaded order
 */
export async function assertOrderPaymentAccess(
  session: AuthenticatedSession,
  order: Order,
): Promise<void> {
  if (session.profile.role === 'owner') {
    return;
  }
  if (session.profile.role !== 'reseller') {
    throw new AuthError('FORBIDDEN', 'You do not have access to this order', 403);
  }
  const tenant = await getTenantByUserId(asDbClient(session.admin), session.user.id);
  if (order.tenantId !== tenant.id) {
    throw new AuthError('FORBIDDEN', 'You do not have access to this order', 403);
  }
}
