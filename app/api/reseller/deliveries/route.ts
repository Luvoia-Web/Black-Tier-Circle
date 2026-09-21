/**
 * @file app/api/reseller/deliveries/route.ts
 *
 * GET manual delivery queue for the session tenant.
 *
 * Phase 9 auth audit: getUser() via requireReseller.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { formatUsdt } from '@/lib/money';
import { getCustomerById } from '@/modules/bots';
import { getProduct } from '@/modules/catalog';
import { listOrders } from '@/modules/orders';

export const dynamic = 'force-dynamic';

function waitingMs(createdAt: Date): number {
  return Date.now() - createdAt.getTime();
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    const params = new URL(request.url).searchParams;
    const search = (params.get('q') ?? '').trim().toLowerCase();
    const status = params.get('status') ?? 'all';
    const report = params.get('report') ?? 'all';
    const from = params.get('from');
    const to = params.get('to');
    const db = asDbClient(session.admin);
    const orders = await listOrders(db, { tenantId: session.tenant.id, limit: 500 });
    const now = new Date();
    const rows = await Promise.all(
      orders
        .filter((order) => {
          if (from && order.createdAt < new Date(from)) {
            return false;
          }
          if (to && order.createdAt > new Date(`${to}T23:59:59`)) {
            return false;
          }
          if (report === 'today') {
            if (order.createdAt.toDateString() !== now.toDateString()) {
              return false;
            }
          } else if (report === 'yesterday') {
            const y = new Date(now);
            y.setDate(y.getDate() - 1);
            if (order.createdAt.toDateString() !== y.toDateString()) {
              return false;
            }
          } else if (report === 'week') {
            const start = new Date(now);
            start.setDate(start.getDate() - 6);
            if (order.createdAt < start) {
              return false;
            }
          }
          return (
            order.fulfillmentStatus === 'manual_pending' ||
            order.fulfillmentStatus === 'ready' ||
            order.fulfillmentStatus === 'failed'
          );
        })
        .map(async (order) => {
          const product = await getProduct(db, order.productId);
          let customerLabel = '—';
          if (order.customerId) {
            try {
              const customer = await getCustomerById(db, order.customerId);
              customerLabel = customer.username ? `@${customer.username}` : customer.telegramUserId;
            } catch {
              customerLabel = '—';
            }
          }
          let queueStatus: 'pending' | 'completed' | 'failed' = 'pending';
          if (order.fulfillmentStatus === 'failed') {
            queueStatus = 'failed';
          } else if (order.fulfillmentStatus === 'ready') {
            queueStatus = 'completed';
          }
          return {
            orderId: order.id,
            customerLabel,
            productTitle: product.title,
            amount: formatUsdt(order.quotedRetailPriceMinor),
            createdAt: order.createdAt.toISOString(),
            waitingMs: waitingMs(order.createdAt),
            status: queueStatus,
          };
        }),
    );
    const filtered = rows.filter((row) => {
      if (status !== 'all' && row.status !== status) {
        return false;
      }
      if (!search) {
        return true;
      }
      return row.productTitle.toLowerCase().includes(search) || row.orderId.toLowerCase().includes(search);
    });
    return jsonSuccess({ rows: filtered });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
