/**
 * @file app/api/reseller/orders/route.ts
 *
 * GET, reseller only. Lists orders for the session tenant.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { formatUsdt } from '@/lib/money';
import { getProduct } from '@/modules/catalog';
import { matchesResellerOrderTab } from '@/modules/fulfillment';
import { listOrders } from '@/modules/orders';

export const dynamic = 'force-dynamic';

function asTab(value: string | null): 'active' | 'completed' | 'failed' {
  if (value === 'completed' || value === 'failed' || value === 'active') {
    return value;
  }
  return 'active';
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    const tab = asTab(new URL(request.url).searchParams.get('tab'));
    const db = asDbClient(session.admin);
    const orders = await listOrders(db, { tenantId: session.tenant.id, limit: 100 });
    const filtered = orders.filter((order) => matchesResellerOrderTab(order, tab));
    const rows = await Promise.all(
      filtered.map(async (order) => {
        const product = await getProduct(db, order.productId);
        return {
          orderId: order.id,
          productTitle: product.title,
          amount: formatUsdt(order.quotedRetailPriceMinor),
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          deliveryStatus: order.deliveryStatus,
          createdAt: order.createdAt.toISOString(),
        };
      }),
    );
    return jsonSuccess({ rows });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
