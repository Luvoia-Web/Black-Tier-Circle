/**
 * @file app/api/orders/[orderId]/refund/route.ts
 *
 * POST, owner only. Uses the existing wallet refund. It does not add new money math.
 */

import { z } from 'zod';
import { asDbClient, requireOwner } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { getOrder } from '@/modules/orders';
import { refundWalletPaymentOnce } from '@/modules/payments';

export const dynamic = 'force-dynamic';

const RefundBodySchema = z.object({
  reason: z.string().trim().min(5, 'Enter a reason of at least 5 characters before refunding.').max(500),
});

type RouteContext = { readonly params: { readonly orderId: string } };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    await assertRateLimit(`order-refund:${session.user.id}`, 15);
    const parsed = RefundBodySchema.parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    const order = await getOrder(db, context.params.orderId);
    if (!order.customerId) {
      throw new AppError('REFUND_UNAVAILABLE', 'This order has no buyer wallet to refund.', 400);
    }
    const result = await refundWalletPaymentOnce(db, order.id, order.customerId);
    if (result === 'none') {
      throw new AppError('REFUND_UNAVAILABLE', 'This order cannot be refunded. It may already be delivered, or it was not paid from a wallet.', 400);
    }
    await db.from('audit_log').insert({
      actor_id: session.user.id,
      tenant_id: order.tenantId,
      action: 'order.refunded',
      target_type: 'order',
      target_id: order.id,
      reason: parsed.reason,
      after_val: {
        status: result,
        amountMinor: order.quotedRetailPriceMinor.toString(),
        customerId: order.customerId,
      },
    });
    return jsonSuccess({ status: result });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
