/**
 * Supplier order monitor and health.
 * Balance history comes from supplier_balance_snapshots.
 */

import { AppError } from '@/lib/errors';
import { isOrderCanceled, isOrderDelivered, NOT_DELIVERED_STATUSES } from '@/lib/order-state';
import type { DbClient, QueryResult } from '@/lib/supabase/query';

export type SupplierOrderRow = {
  readonly attemptId: string;
  readonly orderId: string;
  readonly productTitle: string;
  readonly quantity: number;
  readonly status: string;
  readonly attemptStatus: string;
  readonly orderDelivered: boolean;
  readonly supplierCostMinor: string;
  readonly canComplete: boolean;
  readonly canFail: boolean;
  readonly canResubmit: boolean;
  readonly canReconcile: boolean;
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
  readonly balanceTrend: readonly number[];
};

export type SupplierDesk = {
  readonly orders: readonly SupplierOrderRow[];
  readonly health: readonly SupplierHealthRow[];
  readonly pendingOrders: number;
  readonly note: string;
  readonly needsMigration: boolean;
};

function records(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error) throw new AppError('SUPPLIER_DESK_FAILED', result.error.message, 500);
  if (!Array.isArray(result.data)) return [];
  return result.data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function minorOrNull(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
  return null;
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
  const attempts = records((await db.from('fulfillment_attempts').select('id, order_id, status, error, started_at, completed_at').eq('method', 'supplier').order('started_at', { ascending: false }).limit(1000)) as QueryResult<unknown>);
  const orderIds = [...new Set(attempts.map((row) => text(row.order_id)).filter(Boolean))];
  const orders = orderIds.length === 0
    ? []
    : records((await db.from('orders').select('id, product_id, quantity, quoted_wholesale_price, payment_status, fulfillment_status, delivery_status').in('id', orderIds)) as QueryResult<unknown>);
  const productIds = [...new Set(orders.map((row) => text(row.product_id)).filter(Boolean))];
  const products = productIds.length === 0
    ? []
    : records((await db.from('products').select('id, title, supplier_id, supplier_price_minor').in('id', productIds)) as QueryResult<unknown>);
  const orderById = new Map(orders.map((row) => [text(row.id), row]));
  const productById = new Map(products.map((row) => [text(row.id), row]));
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
  const snapshots = (await db.from('supplier_balance_snapshots').select('supplier_id, balance_usdt, checked_at').order('checked_at', { ascending: true }).limit(500)) as QueryResult<unknown>;
  const trend = new Map<string, number[]>();
  for (const row of records(snapshots)) {
    const id = text(row.supplier_id);
    const value = Number(row.balance_usdt);
    if (!id || !Number.isFinite(value)) continue;
    const series = trend.get(id) ?? [];
    series.push(value);
    trend.set(id, series);
  }
  const pending = records((await db.from('orders').select('id').in('fulfillment_status', ['supplier_pending', 'processing', 'outcome_unknown']).in('delivery_status', [...NOT_DELIVERED_STATUSES]).limit(500)) as QueryResult<unknown>);
  const seenOrders = new Set<string>();
  return {
    orders: attempts.slice(0, 40).map((row, index) => {
      const orderId = text(row.order_id);
      const isLatestAttempt = orderId.length > 0 && !seenOrders.has(orderId);
      if (orderId) seenOrders.add(orderId);
      const order = orderById.get(orderId);
      const tracks = {
        paymentStatus: text(order?.payment_status),
        fulfillmentStatus: text(order?.fulfillment_status),
        deliveryStatus: text(order?.delivery_status),
      };
      const orderDelivered = isOrderDelivered(tracks);
      const orderCanceled = isOrderCanceled(tracks);
      const activeFulfillment = tracks.fulfillmentStatus;
      const attemptStatus = text(row.status) || 'pending';
      const quantity = Math.max(1, Number(order?.quantity ?? 1) || 1);
      const product = productById.get(text(order?.product_id));
      const unitSupplierPrice = minorOrNull(product?.supplier_price_minor);
      const wholesaleMinor = minorOrNull(order?.quoted_wholesale_price) ?? 0n;
      const supplierCostMinor = (
        unitSupplierPrice !== null ? unitSupplierPrice * BigInt(quantity) : wholesaleMinor
      ).toString();
      const waitingOnSupplier =
        isLatestAttempt &&
        !orderDelivered &&
        !orderCanceled &&
        (activeFulfillment === 'outcome_unknown' || activeFulfillment === 'supplier_pending');
      const canResubmit =
        isLatestAttempt &&
        !orderDelivered &&
        !orderCanceled &&
        (activeFulfillment === 'outcome_unknown' ||
          activeFulfillment === 'failed' ||
          activeFulfillment === 'supplier_pending');
      return {
        attemptId: text(row.id) || `${orderId}:${text(row.started_at)}:${index}`,
        orderId,
        productTitle: text(product?.title) || 'Product',
        quantity,
        status: orderDelivered ? 'delivered' : activeFulfillment || attemptStatus,
        attemptStatus,
        orderDelivered,
        supplierCostMinor,
        canComplete: waitingOnSupplier,
        canFail: waitingOnSupplier,
        canResubmit,
        canReconcile: waitingOnSupplier,
        error: text(row.error) || null,
        startedAt: text(row.started_at),
      };
    }).filter((row) => row.orderId),
    health: suppliers.map((row) => {
      const stats = statsFor(bySupplier.get(text(row.id)) ?? []);
      return {
        supplierId: text(row.id),
        name: text(row.name),
        status: text(row.status),
        lastSyncAt: text(row.last_sync_at) || null,
        lastSyncError: text(row.last_sync_error) || null,
        balance:
          typeof row.balance_usdt === 'number' && Number.isFinite(row.balance_usdt)
            ? String(row.balance_usdt)
            : text(row.balance_usdt) || '0',
        errorRate: stats.errorRate,
        averageMinutes: stats.averageMinutes,
        balanceTrend: trend.get(text(row.id)) ?? [],
      };
    }),
    pendingOrders: pending.length,
    needsMigration: false,
    note: 'Balance history updates automatically with each check and sync.',
  };
}
