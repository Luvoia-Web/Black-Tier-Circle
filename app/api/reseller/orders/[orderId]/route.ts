/**
 * @file app/api/reseller/orders/[orderId]/route.ts
 *
 * GET, reseller only. Order detail scoped to the session tenant.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { formatUsdt } from '@/lib/money';
import { getProduct } from '@/modules/catalog';
import { getOrder, getOrderEvents } from '@/modules/orders';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly orderId: string };
};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireReseller();
    const db = asDbClient(session.admin);
    const order = await getOrder(db, context.params.orderId);
    if (order.tenantId !== session.tenant.id) {
      throw new AuthError('FORBIDDEN', 'You do not have access to this order', 403);
    }
    const product = await getProduct(db, order.productId);
    const events = await getOrderEvents(db, order.id);
    return jsonSuccess({
      orderId: order.id,
      productTitle: product.title,
      amount: formatUsdt(order.quotedRetailPriceMinor),
      createdAt: order.createdAt.toISOString(),
      paymentStatus: order.paymentStatus,
      fundingStatus: order.fundingStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      deliveryStatus: order.deliveryStatus,
      events: events.map((event) => ({
        id: event.id,
        track: event.track,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        createdAt: event.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
