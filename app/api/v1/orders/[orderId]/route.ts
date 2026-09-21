/**
 * @file app/api/v1/orders/[orderId]/route.ts
 *
 * GET: order detail scoped to the API key's tenant.
 *
 * @module ApiV1
 */

import { API_CONFIG } from '@/lib/api-config';
import { AuthError } from '@/lib/errors';
import { authenticateV1Request, handleV1Error, v1Db, v1Success } from '@/lib/v1-auth';
import { v1OrderDetail } from '@/lib/v1-presenters';
import { getOrder } from '@/modules/orders';
import { getPaymentStatus } from '@/modules/payments';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: { orderId: string };
};

/**
 * Returns a single order if it belongs to the authenticated tenant.
 */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  try {
    const ctx = await authenticateV1Request(
      request,
      'orders:read',
      'orders.detail',
      API_CONFIG.rateLimits.readRequestsPerMinute,
    );
    const db = v1Db();
    const order = await getOrder(db, context.params.orderId);
    if (order.tenantId !== ctx.tenantId) {
      throw new AuthError(API_CONFIG.errors.FORBIDDEN, 'Order does not belong to this tenant', 403);
    }
    const payment = await getPaymentStatus(db, order.id);
    return v1Success(v1OrderDetail(order, payment.claim));
  } catch (error: unknown) {
    return handleV1Error(error);
  }
}
