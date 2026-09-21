/**
 * @file app/api/v1/orders/[orderId]/pay/binance/verify/route.ts
 *
 * POST: submit a Binance Pay order ID for verification.
 *
 * @module ApiV1
 */

import { API_CONFIG } from '@/lib/api-config';
import { AuthError } from '@/lib/errors';
import { readJsonBody } from '@/lib/http';
import { authenticateV1Request, handleV1Error, v1Db, v1Success } from '@/lib/v1-auth';
import { V1BinanceVerifySchema } from '@/lib/validations/v1';
import { getOrder } from '@/modules/orders';
import { verifyBinancePayClaim } from '@/modules/payments';
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
      'payments.binance.verify',
      API_CONFIG.rateLimits.paymentVerificationPerMinute,
    );
    const parsed = V1BinanceVerifySchema.parse(await readJsonBody(request));
    const db = v1Db();
    const order = await getOrder(db, context.params.orderId);
    if (order.tenantId !== ctx.tenantId) {
      throw new AuthError(API_CONFIG.errors.FORBIDDEN, 'Order does not belong to this tenant', 403);
    }
    const result = await verifyBinancePayClaim(db, {
      orderId: order.id,
      binanceOrderId: parsed.binanceOrderId,
    });
    return v1Success({
      verified: result.verified,
      message: result.verified ? 'Payment verified' : (result.rejectReason ?? 'Payment not verified'),
    });
  } catch (error: unknown) {
    return handleV1Error(error);
  }
}
