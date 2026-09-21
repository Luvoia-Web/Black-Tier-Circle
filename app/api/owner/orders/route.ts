/**
 * @file app/api/owner/orders/route.ts
 *
 * GET, owner only. Paginated orders with all four status tracks.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { formatUsdt } from '@/lib/money';
import { getProduct } from '@/modules/catalog';
import {
  isManualFulfillmentOverdue,
  matchesOwnerOrderTab,
  type OwnerOrderTab,
} from '@/modules/fulfillment';
import { listOrders } from '@/modules/orders';

export const dynamic = 'force-dynamic';

function asTab(value: string | null): OwnerOrderTab {
  if (
    value === 'all' ||
    value === 'awaiting_payment' ||
    value === 'pending_fulfillment' ||
    value === 'manual_pending' ||
    value === 'completed' ||
    value === 'failed'
  ) {
    return value;
  }
  return 'all';
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const url = new URL(request.url);
    const tab = asTab(url.searchParams.get('tab'));
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '20') || 20));
    const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const db = asDbClient(session.admin);
    const orders = await listOrders(db, { limit: 200 });
    const filtered = orders.filter((order) => {
      if (!matchesOwnerOrderTab(order, tab)) {
        return false;
      }
      if (query.length === 0) {
        return true;
      }
      return order.id.replaceAll('-', '').toLowerCase().startsWith(query.replaceAll('-', '')) ||
        order.id.slice(0, 8).toLowerCase().includes(query);
    });
    const start = (page - 1) * limit;
    const pageRows = filtered.slice(start, start + limit);
    const rows = await Promise.all(
      pageRows.map(async (order) => {
        const product = await getProduct(db, order.productId);
        return {
          orderId: order.id,
          channel: order.channel,
          productTitle: product.title,
          amount: formatUsdt(order.quotedRetailPriceMinor),
          paymentStatus: order.paymentStatus,
          fundingStatus: order.fundingStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          deliveryStatus: order.deliveryStatus,
          createdAt: order.createdAt.toISOString(),
          overdue: order.fulfillmentStatus === 'manual_pending' && isManualFulfillmentOverdue(order.createdAt),
        };
      }),
    );
    return jsonSuccess({
      rows,
      page,
      limit,
      total: filtered.length,
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
