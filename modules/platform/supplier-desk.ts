/**
 * Supplier order monitor and the health numbers that can be read today.
 * Sync history is the last sync on the supplier row. Older balances are not stored.
 */

import { AppError } from '@/lib/errors';
import type { DbClient, QueryResult } from '@/lib/supabase/query';

export type SupplierOrderRow = {
  readonly orderId: string;
  readonly status: string;
  readonly error: string | null;
  readonly startedAt: string;
};

export type SupplierHealthRow = {
  readonly supplierId: string;
  readonly name: string;
  readonly status: string;
  readonly lastSyncAt: string | null;
  readonly lastSyncError: string | null;
  readonly balance: string;
  readonly errorRate: number | null;
  readonly averageMinutes: number | null;
};

export type SupplierDesk = {
  readonly orders: readonly SupplierOrderRow[];
  readonly health: readonly SupplierHealthRow[];
  readonly pendingOrders: number;
  readonly note: string;
};

function records(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error) throw new AppError('SUPPLIER_DESK_FAILED', result.error.message, 500);
  if (!Array.isArray(result.data)) return [];
  return result.data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function statsFor(attempts: readonly Record<string, unknown>[]): { readonly errorRate: number | null; readonly averageMinutes: number | null } {
  let failed = 0;
  let timed = 0;
  let minutes = 0;
  for (const attempt of attempts) {
    if (text(attempt.status) === 'failed' || text(attempt.error)) failed += 1;
    const start = Date.parse(text(attempt.started_at));
    const end = Date.parse(text(attempt.completed_at));
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      timed += 1;
      minutes += (end - start) / 60000;
    }
  }
  return {
    errorRate: attempts.length === 0 ? null : Math.round((failed / attempts.length) * 1000) / 10,
    averageMinutes: timed === 0 ? null : Math.round((minutes / timed) * 10) / 10,
  };
}

export async function readSupplierDesk(db: DbClient): Promise<SupplierDesk> {
  const attempts = records((await db.from('fulfillment_attempts').select('order_id, status, error, started_at, completed_at').eq('method', 'supplier').order('started_at', { ascending: false }).limit(1000)) as QueryResult<unknown>);
  const orderIds = [...new Set(attempts.map((row) => text(row.order_id)).filter(Boolean))];
  const orders = orderIds.length === 0
    ? []
    : records((await db.from('orders').select('id, product_id, fulfillment_status').in('id', orderIds)) as QueryResult<unknown>);
  const productIds = [...new Set(orders.map((row) => text(row.product_id)).filter(Boolean))];
  const products = productIds.length === 0
    ? []
    : records((await db.from('products').select('id, supplier_id').in('id', productIds)) as QueryResult<unknown>);
  const statusById = new Map(orders.map((row) => [text(row.id), text(row.fulfillment_status)]));
  const productByOrder = new Map(orders.map((row) => [text(row.id), text(row.product_id)]));
  const supplierByProduct = new Map(products.map((row) => [text(row.id), text(row.supplier_id)]));
  const bySupplier = new Map<string, Record<string, unknown>[]>();
  for (const attempt of attempts) {
    const supplierId = supplierByProduct.get(productByOrder.get(text(attempt.order_id)) ?? '') ?? '';
    if (!supplierId) continue;
    const group = bySupplier.get(supplierId) ?? [];
    group.push(attempt);
    bySupplier.set(supplierId, group);
  }
  const suppliers = records((await db.from('suppliers').select('id, name, status, last_sync_at, last_sync_error, balance_usdt').order('name', { ascending: true }).limit(100)) as QueryResult<unknown>);
  const pending = records((await db.from('orders').select('id').in('fulfillment_status', ['supplier_pending', 'processing', 'outcome_unknown']).limit(500)) as QueryResult<unknown>);
  return {
    orders: attempts.slice(0, 40).map((row) => ({
      orderId: text(row.order_id),
      status: statusById.get(text(row.order_id)) || text(row.status) || 'pending',
      error: text(row.error) || null,
      startedAt: text(row.started_at),
    })).filter((row) => row.orderId),
    health: suppliers.map((row) => {
      const stats = statsFor(bySupplier.get(text(row.id)) ?? []);
      return {
        supplierId: text(row.id),
        name: text(row.name),
        status: text(row.status),
        lastSyncAt: text(row.last_sync_at) || null,
        lastSyncError: text(row.last_sync_error) || null,
        balance: text(row.balance_usdt) || '0',
        errorRate: stats.errorRate,
        averageMinutes: stats.averageMinutes,
      };
    }),
    pendingOrders: pending.length,
    note: 'No balance history yet. Only the latest balance and the latest sync result are stored.',
  };
}
