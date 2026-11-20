/**
 * Stock for the Inventory tab.
 * A null products.reorder_point uses REORDER_POINT (10).
 */

import { AppError } from '@/lib/errors';
import type { DbClient, QueryResult } from '@/lib/supabase/query';

export const REORDER_POINT = 10;

export type InventoryRow = {
  readonly id: string;
  readonly title: string;
  readonly supplierName: string;
  readonly deliveryType: string;
  readonly onHand: number | null;
  readonly unlimited: boolean;
  readonly reorderPoint: number;
  readonly sold30: number;
  readonly daysLeft: number | null;
  readonly mode: 'manual' | 'supplier' | 'units';
  readonly supplierLive: string;
  readonly attention: boolean;
  readonly costMinor: string;
};

export type InventoryPage = {
  readonly rows: readonly InventoryRow[];
  readonly stockValueMinor: string;
  readonly unitsOnHand: number;
  readonly attentionCount: number;
  readonly role: 'owner' | 'reseller';
  readonly needsMigration: boolean;
};

export function reorderPointOf(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  if (Number.isInteger(number) && number >= 0) return number;
  return REORDER_POINT;
}

function records(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error) throw new AppError('INVENTORY_READ_FAILED', result.error.message, 500);
  if (!Array.isArray(result.data)) return [];
  return result.data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function modeOf(delivery: string, supplierId: string): InventoryRow['mode'] {
  if (supplierId || delivery === 'supplier_api') return 'supplier';
  if (delivery === 'manual') return 'manual';
  return 'units';
}

export async function readInventory(
  db: DbClient,
  scope: { readonly role: 'owner' | 'reseller'; readonly tenantId: string | null },
  attentionOnly: boolean,
): Promise<InventoryPage> {
  let allowed: Set<string> | null = null;
  if (scope.role === 'reseller') {
    if (!scope.tenantId) throw new AppError('TENANT_REQUIRED', 'Reseller account is not active', 403);
    const listings = records((await db.from('reseller_listings').select('product_id').eq('tenant_id', scope.tenantId).limit(1000)) as QueryResult<unknown>);
    allowed = new Set(listings.map((row) => text(row.product_id)).filter(Boolean));
  }
  const wide = (await db.from('products').select('id, title, status, stock_unlimited, stock_count, supplier_id, delivery_type, wholesale_price, reorder_point').limit(1000)) as QueryResult<unknown>;
  const products = records(wide);
  const ids = products.map((row) => text(row.id)).filter((id) => id && (!allowed || allowed.has(id)));
  const suppliers =
    scope.role === 'owner'
      ? records((await db.from('suppliers').select('id, name').limit(100)) as QueryResult<unknown>)
      : [];
  const names = new Map(suppliers.map((row) => [text(row.id), text(row.name)]));
  const linked = ids.length === 0
    ? []
    : records((await db.from('supplier_products').select('product_id, stock_count, in_stock, supplier_id').in('product_id', ids).limit(1000)) as QueryResult<unknown>);
  const linkByProduct = new Map(linked.map((row) => [text(row.product_id), row]));
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let orders = db.from('orders').select('product_id, quantity').eq('payment_status', 'verified').gte('created_at', since).limit(5000);
  if (scope.tenantId) orders = orders.eq('tenant_id', scope.tenantId);
  const sold = new Map<string, number>();
  for (const row of records((await orders) as QueryResult<unknown>)) {
    const id = text(row.product_id);
    const qty = typeof row.quantity === 'number' ? row.quantity : 1;
    if (id) sold.set(id, (sold.get(id) ?? 0) + qty);
  }
  let stockValue = 0n;
  let units = 0;
  const rows: InventoryRow[] = [];
  for (const product of products) {
    const id = text(product.id);
    if (!id || text(product.status) === 'archived' || (allowed && !allowed.has(id))) continue;
    const link = linkByProduct.get(id);
    const unlimited = product.stock_unlimited === true;
    const supplierOut = link?.in_stock === false;
    const supplierCount = typeof link?.stock_count === 'number' ? link.stock_count : null;
    const ownCount = typeof product.stock_count === 'number' ? product.stock_count : null;
    const delivery = text(product.delivery_type);
    const mode = modeOf(delivery, text(product.supplier_id));
    const onHand = mode === 'supplier' ? supplierCount : unlimited ? null : ownCount;
    const reorderPoint = reorderPointOf(product.reorder_point);
    const attention = supplierOut || (!unlimited && (onHand ?? 0) <= reorderPoint);
    const sold30 = sold.get(id) ?? 0;
    const daysLeft = onHand !== null && sold30 > 0 ? Math.floor((onHand * 30) / sold30) : null;
    const cost = text(product.wholesale_price) || '0';
    if (!unlimited && onHand !== null && onHand > 0) {
      try {
        stockValue += BigInt(cost) * BigInt(onHand);
        units += onHand;
      } catch {
        // A bad price is skipped in the total and still shown on the row.
      }
    }
    const supplierLive = !link ? '—' : supplierOut ? 'Out of stock' : supplierCount === null ? '∞' : String(supplierCount);
    rows.push({
      id,
      title: text(product.title) || id,
      supplierName:
        scope.role === 'reseller'
          ? 'Platform catalog'
          : names.get(text(product.supplier_id)) || (mode === 'supplier' ? 'Supplier' : 'Own product'),
      deliveryType: delivery || 'manual',
      onHand,
      unlimited,
      reorderPoint,
      sold30,
      daysLeft,
      mode,
      supplierLive,
      attention,
      costMinor: cost,
    });
  }
  const visible = attentionOnly ? rows.filter((row) => row.attention) : rows;
  visible.sort((left, right) => Number(right.attention) - Number(left.attention) || (left.onHand ?? 1_000_000) - (right.onHand ?? 1_000_000));
  return {
    rows: visible,
    stockValueMinor: stockValue.toString(),
    unitsOnHand: units,
    attentionCount: rows.filter((row) => row.attention).length,
    role: scope.role,
    needsMigration: false,
  };
}

export async function saveReorderPoint(db: DbClient, productId: string, point: number): Promise<{ readonly needsMigration: boolean }> {
  if (!Number.isInteger(point) || point < 0 || point > 1_000_000) {
    throw new AppError('INVALID_REORDER_POINT', 'The reorder point must be zero or more.', 400);
  }
  const saved = (await db.from('products').update({ reorder_point: point, updated_at: new Date().toISOString() }).eq('id', productId)) as QueryResult<unknown>;
  if (saved.error) throw new AppError('INVENTORY_SAVE_FAILED', saved.error.message, 500);
  return { needsMigration: false };
}
