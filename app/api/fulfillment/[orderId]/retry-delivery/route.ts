/**
 * @file app/api/fulfillment/[orderId]/retry-delivery/route.ts
 *
 * POST, owner only. Retries Telegram delivery.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { FulfillmentError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { retryDelivery } from '@/modules/fulfillment';
import { getOrder } from '@/modules/orders';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly orderId: string };
};

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const db = asDbClient(session.admin);
    const order = await getOrder(db, context.params.orderId);
    if (order.deliveryStatus === 'sent') {
      throw new FulfillmentError(
        'DELIVERY_NOT_RETRYABLE',
        'A delivered order cannot be re-delivered. Use Replace to send a new item.',
      );
    }
    await retryDelivery(db, context.params.orderId);
    return jsonSuccess({ success: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
