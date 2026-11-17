/**
 * @file app/api/orders/[orderId]/refund/route.ts
 *
 * POST, owner only. Uses the existing wallet refund. It does not add new money math.
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { getOrder } from '@/modules/orders';
import { refundWalletPaymentOnce } from '@/modules/payments';

export const dynamic = 'force-dynamic';

type RouteContext = { readonly params: { readonly orderId: string } };

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const db = asDbClient(session.admin);
    const order = await getOrder(db, context.params.orderId);
    if (!order.customerId) {
      throw new AppError('REFUND_UNAVAILABLE', 'This order has no buyer wallet to refund.', 400);
    }
    const result = await refundWalletPaymentOnce(db, order.id, order.customerId);
    if (result === 'none') {
      throw new AppError('REFUND_UNAVAILABLE', 'This order cannot be refunded. It may already be delivered, or it was not paid from a wallet.', 400);
    }
    return jsonSuccess({ status: result });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
