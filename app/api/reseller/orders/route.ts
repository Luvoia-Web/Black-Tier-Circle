/**
 * @file app/api/reseller/orders/route.ts
 *
 * GET, reseller only. Lists orders for the session tenant with search/filters.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { customerLabel, listCustomersByIds, listProductsByIds } from '@/lib/lookups';
import { formatUsdt } from '@/lib/money';
import { inPeriod, parseDashboardPeriod, periodRange } from '@/lib/period';
import { listOrders, type PaymentStatus } from '@/modules/orders';

export const dynamic = 'force-dynamic';

function paymentBadge(status: PaymentStatus): 'paid' | 'pending' | 'failed' | 'refunded' {
  if (status === 'verified' || status === 'not_required') {
    return 'paid';
  }
  if (status === 'failed' || status === 'expired' || status === 'disputed') {
    return 'failed';
  }
  if (status === 'refunded' || status === 'refund_pending') {
    return 'refunded';
  }
  return 'pending';
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    const params = new URL(request.url).searchParams;
    const period = parseDashboardPeriod(params.get('period') ?? 'lifetime');
    const search = (params.get('q') ?? '').trim().toLowerCase();
    const statusFilter = params.get('status') ?? 'all';
    const pageSizeRaw = Number(params.get('pageSize') ?? params.get('limit') ?? '20');
    const pageRaw = Number(params.get('page') ?? '1');
    const pageSize = pageSizeRaw === 50 || pageSizeRaw === 100 ? pageSizeRaw : 20;
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const db = asDbClient(session.admin);
    const orders = await listOrders(db, { tenantId: session.tenant.id, limit: 500 });
    const range = periodRange(period);
    const inRange = orders.filter((order) => inPeriod(order.createdAt, range));
    const [products, customers] = await Promise.all([
      listProductsByIds(
        db,
        inRange.map((order) => order.productId),
      ),
      listCustomersByIds(
        db,
        inRange.map((order) => order.customerId ?? ''),
      ),
    ]);
    const rows = inRange.map((order) => {
      const product = products.get(order.productId);
      const customer = order.customerId ? customers.get(order.customerId) : undefined;
      const label = customerLabel(customer, order.customerId);
      return {
        orderId: order.id,
        createdAt: order.createdAt.toISOString(),
        productTitle: product?.title ?? order.productId.slice(0, 8).toUpperCase(),
        customerLabel: label,
        customerUsername: customer?.username ?? '',
        quantity: 1,
        totalMinor: order.quotedRetailPriceMinor.toString(),
        total: formatUsdt(order.quotedRetailPriceMinor),
        method: order.paymentMethod ?? '—',
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        deliveryStatus: order.deliveryStatus,
        badge: paymentBadge(order.paymentStatus),
      };
    });
    const filtered = rows.filter((row) => {
      if (statusFilter !== 'all' && row.badge !== statusFilter) {
        return false;
      }
      if (!search) {
        return true;
      }
      return (
        row.orderId.toLowerCase().includes(search) ||
        row.productTitle.toLowerCase().includes(search) ||
        row.customerLabel.toLowerCase().includes(search) ||
        row.customerUsername.toLowerCase().includes(search)
      );
    });
    const start = (page - 1) * pageSize;
    return jsonSuccess(
      {
        rows: filtered.slice(start, start + pageSize),
        total: filtered.length,
        page,
        pageSize,
      },
      200,
      { cache: 'short' },
    );
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
