/**
 * @file app/api/payments/binance/create/route.ts
 *
 * POST, authenticated. Creates a Binance Pay checkout for an order.
 *
 * @module Api
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertOrderPaymentAccess } from '@/lib/payment-access';
import { PAYMENT_CONFIG } from '@/lib/payment-config';
import { CreateBinanceOrderSchema } from '@/lib/validations/payments';
import { getOrder } from '@/modules/orders';
import { createBinancePayOrder } from '@/modules/payments';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    const parsed = CreateBinanceOrderSchema.parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    const order = await getOrder(db, parsed.orderId);
    await assertOrderPaymentAccess(session, order);
    const result = await createBinancePayOrder(db, parsed.orderId);
    return jsonSuccess({
      prepayId: result.prepayId,
      checkoutUrl: result.checkoutUrl,
      isDemoMode: PAYMENT_CONFIG.mode === 'demo',
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
