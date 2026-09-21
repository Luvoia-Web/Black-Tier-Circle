/**
 * @file app/api/v1/orders/[orderId]/pay/binance/route.ts
 *
 * POST: create a Binance Pay checkout for an existing tenant order.
 *
 * @module ApiV1
 */

import { API_CONFIG } from '@/lib/api-config';
import { AuthError } from '@/lib/errors';
import { PAYMENT_CONFIG } from '@/lib/payment-config';
import { authenticateV1Request, handleV1Error, v1Db, v1Success } from '@/lib/v1-auth';
import { getOrder } from '@/modules/orders';
import { createBinancePayOrder } from '@/modules/payments';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: { orderId: string };
};

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  try {
    const ctx = await authenticateV1Request(
      request,
      'payments:write',
      'payments.binance.create',
      API_CONFIG.rateLimits.paymentVerificationPerMinute,
    );
    const db = v1Db();
    const order = await getOrder(db, context.params.orderId);
    if (order.tenantId !== ctx.tenantId) {
      throw new AuthError(API_CONFIG.errors.FORBIDDEN, 'Order does not belong to this tenant', 403);
    }
    const result = await createBinancePayOrder(db, order.id);
    return v1Success({
      prepayId: result.prepayId,
      checkoutUrl: result.checkoutUrl,
      isDemoMode: PAYMENT_CONFIG.mode === 'demo',
    });
  } catch (error: unknown) {
    return handleV1Error(error);
  }
}
