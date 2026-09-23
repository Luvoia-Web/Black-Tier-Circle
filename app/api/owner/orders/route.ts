/**
 * @file app/api/owner/orders/route.ts
 *
 * GET, owner only. Paginated orders with all four status tracks.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { listProductsByIds } from '@/lib/lookups';
import { formatUsdt } from '@/lib/money';
import { pageMeta, parsePageParams } from '@/lib/pagination';
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
    const { page, limit } = parsePageParams(url.searchParams, { limit: 20 });
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
      return (
        order.id.replaceAll('-', '').toLowerCase().startsWith(query.replaceAll('-', '')) ||
        order.id.slice(0, 8).toLowerCase().includes(query)
      );
    });
    const start = (page - 1) * limit;
    const pageRows = filtered.slice(start, start + limit);
    const products = await listProductsByIds(
      db,
      pageRows.map((order) => order.productId),
    );
    const rows = pageRows.map((order) => {
      const product = products.get(order.productId);
      return {
        orderId: order.id,
        channel: order.channel,
        productTitle: product?.title ?? order.productId.slice(0, 8).toUpperCase(),
        amount: formatUsdt(order.quotedRetailPriceMinor),
        paymentStatus: order.paymentStatus,
        fundingStatus: order.fundingStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        deliveryStatus: order.deliveryStatus,
        createdAt: order.createdAt.toISOString(),
        overdue: order.fulfillmentStatus === 'manual_pending' && isManualFulfillmentOverdue(order.createdAt),
      };
    });
    return jsonSuccess(
      {
        rows,
        page,
        limit,
        total: filtered.length,
        meta: pageMeta(page, limit, filtered.length),
      },
      200,
      { cache: 'short' },
    );
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
