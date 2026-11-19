/**
 * @file modules/platform/today.ts
 *
 * The triage list for Today. A missing 0032 table does not take the page down.
 */

import { AppError } from '@/lib/errors';
import { formatUsdt } from '@/lib/money';
import { isOrderFailed, NOT_DELIVERED_STATUSES } from '@/lib/order-state';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { isManualFulfillmentOverdue } from '@/modules/fulfillment';
import { ROUTES } from '@/lib/navigation';

export type TodayItem = {
  readonly id: string;
  readonly problem: string;
  readonly actionLabel: string;
  readonly action: 'retry' | 'approve' | 'open';
  readonly href: string;
  readonly targetId: string;
};

export type TodayPayload = {
  readonly role: 'owner' | 'reseller';
  readonly items: readonly TodayItem[];
  readonly supportNeedsMigration: boolean;
  readonly day: {
    readonly orders: number;
    readonly revenue: string;
    readonly newBuyers: number;
  };
};

function records(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error) {
    throw new AppError('READ_FAILED', result.error.message, 500);
  }
  if (!Array.isArray(result.data)) {
    return [];
  }
  return result.data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function missingSchema(error: { message: string; code?: string } | null): boolean {
  if (!error) {
    return false;
  }
  const message = error.message.toLowerCase();
  return error.code === '42P01' || error.code === '42703' || message.includes('does not exist') || message.includes('schema cache');
}

function startOfToday(): string {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

export async function readToday(
  db: DbClient,
  scope: { readonly role: 'owner' | 'reseller'; readonly tenantId: string | null; readonly botId: string | null },
): Promise<TodayPayload> {
  const items: TodayItem[] = [];
  const since = startOfToday();

  let failed = db
    .from('orders')
    .select('id, fulfillment_status, payment_status, delivery_status')
    .or('fulfillment_status.eq.failed,payment_status.eq.failed')
    .in('delivery_status', NOT_DELIVERED_STATUSES)
    .order('created_at', { ascending: false })
    .limit(16);
  let stuck = db.from('orders').select('id, fulfillment_status, created_at').in('fulfillment_status', ['manual_pending', 'queued']).order('created_at', { ascending: true }).limit(20);
  let dayOrders = db.from('orders').select('id, payment_status, quoted_retail_price, created_at').gte('created_at', since).limit(500);
  if (scope.tenantId) {
    failed = failed.eq('tenant_id', scope.tenantId);
    stuck = stuck.eq('tenant_id', scope.tenantId);
    dayOrders = dayOrders.eq('tenant_id', scope.tenantId);
  }
  const [failedResult, stuckResult, dayResult] = await Promise.all([
    failed as unknown as Promise<QueryResult<unknown>>,
    stuck as unknown as Promise<QueryResult<unknown>>,
    dayOrders as unknown as Promise<QueryResult<unknown>>,
  ]);
  if (failedResult.error) {
    throw new AppError('TODAY_ORDERS_FAILED', failedResult.error.message, 500);
  }
  for (const row of records(failedResult)) {
    const id = text(row.id);
    if (!id) {
      continue;
    }
    if (
      !isOrderFailed({
        paymentStatus: text(row.payment_status),
        fulfillmentStatus: text(row.fulfillment_status),
        deliveryStatus: text(row.delivery_status),
      })
    ) {
      continue;
    }
    items.push({
      id: `failed-${id}`,
      problem: `Order ${id.slice(0, 8)} failed ${text(row.fulfillment_status) === 'failed' ? 'during fulfillment' : 'during payment'}.`,
      actionLabel: 'Retry delivery',
      action: 'retry',
      href: `${ROUTES.platform.orders}?order=${encodeURIComponent(id)}`,
      targetId: id,
    });
  }
  for (const row of records(stuckResult)) {
    const id = text(row.id);
    const created = new Date(text(row.created_at));
    if (!id || Number.isNaN(created.getTime()) || !isManualFulfillmentOverdue(created)) {
      continue;
    }
    items.push({
      id: `stuck-${id}`,
      problem: `Order ${id.slice(0, 8)} is still waiting on fulfillment.`,
      actionLabel: 'Open order',
      action: 'open',
      href: `${ROUTES.platform.orders}?order=${encodeURIComponent(id)}`,
      targetId: id,
    });
  }

  if (scope.role === 'owner') {
    const stock = (await db
      .from('supplier_products')
      .select('id, name, product_id')
      .eq('in_stock', false)
      .limit(20)) as QueryResult<unknown>;
    if (!stock.error) {
      for (const row of records(stock)) {
        const productId = text(row.product_id);
        if (!productId) {
          continue;
        }
        items.push({
          id: `stock-${text(row.id)}`,
          problem: `${text(row.name) || 'A published item'} is out of stock at the supplier.`,
          actionLabel: 'Open item',
          action: 'open',
          href: `${ROUTES.platform.catalog}?item=${encodeURIComponent(productId)}`,
          targetId: productId,
        });
        if (items.filter((item) => item.id.startsWith('stock-')).length >= 8) {
          break;
        }
      }
    }
    const suppliers = records((await db.from('suppliers').select('id, name, balance_usdt, status').eq('status', 'active').limit(50)) as QueryResult<unknown>);
    for (const row of suppliers) {
      const balance = Number(row.balance_usdt ?? 0);
      if (!Number.isFinite(balance) || balance >= 20) {
        continue;
      }
      const id = text(row.id);
      items.push({
        id: `balance-${id}`,
        problem: `${text(row.name) || 'A supplier'} has ${balance.toFixed(2)} USDT, which may not cover pending orders.`,
        actionLabel: 'Review money',
        action: 'open',
        href: `${ROUTES.platform.money}?section=suppliers`,
        targetId: id,
      });
    }
    const pending = records((await db.from('tenants').select('id, display_name').eq('status', 'pending').limit(8)) as QueryResult<unknown>);
    for (const row of pending) {
      const id = text(row.id);
      items.push({
        id: `reseller-${id}`,
        problem: `${text(row.display_name) || 'A reseller'} is waiting for approval.`,
        actionLabel: 'Approve reseller',
        action: 'approve',
        href: `${ROUTES.platform.people}?type=reseller&person=${encodeURIComponent(id)}`,
        targetId: id,
      });
    }
  }

  let supportNeedsMigration = false;
  let threads = db.from('support_threads').select('id, last_message_at').eq('status', 'open').eq('unread_for_owner', true).order('last_message_at', { ascending: false }).limit(8);
  if (scope.tenantId) {
    threads = threads.eq('tenant_id', scope.tenantId);
  }
  const threadResult = (await threads) as QueryResult<unknown>;
  if (missingSchema(threadResult.error)) {
    supportNeedsMigration = true;
  } else if (!threadResult.error) {
    for (const row of records(threadResult)) {
      const id = text(row.id);
      items.push({
        id: `support-${id}`,
        problem: 'A buyer is waiting on a reply.',
        actionLabel: 'Open thread',
        action: 'open',
        href: `${ROUTES.platform.people}?thread=${encodeURIComponent(id)}`,
        targetId: id,
      });
    }
  }

  const dayRows = records(dayResult);
  const revenue = dayRows
    .filter((row) => text(row.payment_status) === 'verified')
    .reduce((sum, row) => sum + BigInt(typeof row.quoted_retail_price === 'number' || typeof row.quoted_retail_price === 'string' ? row.quoted_retail_price : 0), 0n);
  let buyers = db.from('customers').select('id', { count: 'exact', head: true }).gte('created_at', since);
  if (scope.botId) {
    buyers = buyers.eq('bot_id', scope.botId);
  } else if (scope.role === 'owner') {
    buyers = buyers.is('bot_id', null);
  }
  const buyerResult = (await buyers) as QueryResult<unknown>;

  return {
    role: scope.role,
    items: items.slice(0, 25),
    supportNeedsMigration,
    day: {
      orders: dayRows.length,
      revenue: formatUsdt(revenue),
      newBuyers: buyerResult.count ?? records(buyerResult).length,
    },
  };
}
