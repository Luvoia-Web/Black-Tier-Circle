/**
 * Overview numbers. Read-only, scoped to the signed-in store.
 */

import { AppError } from '@/lib/errors';
import { formatUsdt, usdtToMinor } from '@/lib/money';
import { buildZonedRange, zonedBucketKey } from '@/lib/period';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { readToday, type TodayItem } from '@/modules/platform/today';

export type OverviewRange = 'today' | '7d' | '30d' | '12m';

export type OverviewPayload = {
  readonly role: 'owner' | 'reseller';
  readonly firstName: string;
  readonly dateLabel: string;
  readonly summary: string;
  readonly range: OverviewRange;
  readonly revenue: string;
  readonly revenueMinor: string;
  readonly previousMinor: string;
  readonly deltaPercent: number;
  readonly series: readonly { readonly label: string; readonly owner: number; readonly reseller: number; readonly api: number }[];
  readonly legend: { readonly owner: string; readonly reseller: string; readonly api: string };
  readonly live: number;
  readonly stages: readonly { readonly label: string; readonly value: number; readonly color: string }[];
  readonly sales: readonly { readonly id: string; readonly buyer: string; readonly product: string; readonly store: string; readonly at: string; readonly amount: string }[];
  readonly kpis: readonly { readonly id: string; readonly label: string; readonly value: string; readonly delta: string; readonly tone: 'up' | 'down' | 'flat' }[];
  readonly attention: readonly TodayItem[];
  readonly resellers: readonly { readonly id: string; readonly name: string; readonly revenue: string; readonly orders: number }[];
  readonly products: readonly { readonly id: string; readonly name: string; readonly units: number; readonly revenue: string }[];
};

function records(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error) throw new AppError('OVERVIEW_FAILED', result.error.message, 500);
  if (!Array.isArray(result.data)) return [];
  return result.data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function minor(value: unknown): bigint {
  try {
    return BigInt(typeof value === 'string' || typeof value === 'number' ? value : 0);
  } catch {
    return 0n;
  }
}

function previousStart(start: Date, now: Date): Date {
  const span = Math.max(86_400_000, now.getTime() - start.getTime());
  return new Date(start.getTime() - span);
}

function usdtNumber(value: bigint): number {
  return Number(value) / 1_000_000;
}

export async function readOverview(
  db: DbClient,
  scope: {
    readonly role: 'owner' | 'reseller';
    readonly tenantId: string | null;
    readonly botId: string | null;
    readonly firstName: string;
    readonly timezone?: string | null;
  },
  range: OverviewRange,
  now: Date = new Date(),
): Promise<OverviewPayload> {
  if (scope.role === 'reseller' && !scope.tenantId) {
    throw new AppError('TENANT_REQUIRED', 'Reseller account is not active', 403);
  }
  const zoned = buildZonedRange(range, now, scope.timezone);
  const start = zoned.start;
  const prior = previousStart(start, now);
  let query = db.from('orders').select('id, tenant_id, channel, payment_status, fulfillment_status, quoted_retail_price, quantity, created_at, customer_id, product_id').gte('created_at', prior.toISOString()).order('created_at', { ascending: false }).limit(1000);
  if (scope.tenantId) query = query.eq('tenant_id', scope.tenantId);
  const rows = records((await query) as QueryResult<unknown>);
  const current = rows.filter((row) => new Date(text(row.created_at)).getTime() >= start.getTime());
  const previous = rows.filter((row) => new Date(text(row.created_at)).getTime() < start.getTime());
  const paid = current.filter((row) => text(row.payment_status) === 'verified');
  const paidBefore = previous.filter((row) => text(row.payment_status) === 'verified');
  const revenueMinor = paid.reduce((sum, row) => sum + minor(row.quoted_retail_price), 0n);
  const previousMinor = paidBefore.reduce((sum, row) => sum + minor(row.quoted_retail_price), 0n);
  const deltaPercent = previousMinor === 0n ? (revenueMinor > 0n ? 100 : 0) : Number(((revenueMinor - previousMinor) * 100n) / previousMinor);

  const buckets = new Map<string, { readonly label: string; owner: bigint; reseller: bigint; api: bigint }>();
  for (const spec of zoned.buckets) {
    buckets.set(spec.key, { label: spec.label, owner: 0n, reseller: 0n, api: 0n });
  }
  for (const row of paid) {
    const key = zonedBucketKey(range, text(row.created_at), zoned.timeZone);
    const slot = key ? buckets.get(key) : undefined;
    if (!slot) continue;
    const amount = minor(row.quoted_retail_price);
    const channel = text(row.channel);
    if (channel === 'api') slot.api += amount;
    else if (channel === 'reseller_bot' || text(row.tenant_id)) slot.reseller += amount;
    else slot.owner += amount;
  }
  const series = [...buckets.values()].map((slot) => ({
    label: slot.label,
    owner: usdtNumber(slot.owner),
    reseller: usdtNumber(slot.reseller),
    api: usdtNumber(slot.api),
  }));
  const ownerTotal = paid.filter((row) => text(row.channel) !== 'api' && !text(row.tenant_id)).reduce((sum, row) => sum + minor(row.quoted_retail_price), 0n);
  const apiTotal = paid.filter((row) => text(row.channel) === 'api').reduce((sum, row) => sum + minor(row.quoted_retail_price), 0n);
  const resellerTotal = revenueMinor - ownerTotal - apiTotal;

  const productIds = [...new Set(paid.map((row) => text(row.product_id)).filter(Boolean))].slice(0, 40);
  const products = productIds.length === 0 ? [] : records((await db.from('products').select('id, title').in('id', productIds)) as QueryResult<unknown>);
  const titles = new Map(products.map((row) => [text(row.id), text(row.title)]));
  const customerIds = [...new Set(paid.map((row) => text(row.customer_id)).filter(Boolean))].slice(0, 40);
  const customers = customerIds.length === 0 ? [] : records((await db.from('customers').select('id, username, first_name').in('id', customerIds)) as QueryResult<unknown>);
  const names = new Map(customers.map((row) => [text(row.id), text(row.username) ? `@${text(row.username)}` : text(row.first_name) || 'Buyer']));
  const tenantIds = [...new Set(paid.map((row) => text(row.tenant_id)).filter(Boolean))].slice(0, 40);
  const tenants = tenantIds.length === 0 ? [] : records((await db.from('tenants').select('id, display_name, business_name').in('id', tenantIds)) as QueryResult<unknown>);
  const stores = new Map(tenants.map((row) => [text(row.id), text(row.business_name) || text(row.display_name) || 'Reseller']));

  const byProduct = new Map<string, { units: number; revenue: bigint }>();
  for (const row of paid) {
    const id = text(row.product_id) || 'unknown';
    const slot = byProduct.get(id) ?? { units: 0, revenue: 0n };
    slot.units += Number(row.quantity ?? 1) || 1;
    slot.revenue += minor(row.quoted_retail_price);
    byProduct.set(id, slot);
  }
  const topProducts = [...byProduct.entries()]
    .sort((a, b) => (a[1].revenue > b[1].revenue ? -1 : 1))
    .slice(0, 5)
    .map(([id, slot]) => ({ id, name: titles.get(id) || 'Product', units: slot.units, revenue: formatUsdt(slot.revenue) }));

  const byStore = new Map<string, { orders: number; revenue: bigint }>();
  for (const row of paid) {
    const id = text(row.tenant_id);
    if (!id) continue;
    const slot = byStore.get(id) ?? { orders: 0, revenue: 0n };
    slot.orders += 1;
    slot.revenue += minor(row.quoted_retail_price);
    byStore.set(id, slot);
  }
  const topResellers = scope.role === 'owner'
    ? [...byStore.entries()].sort((a, b) => (a[1].revenue > b[1].revenue ? -1 : 1)).slice(0, 5).map(([id, slot]) => ({
      id,
      name: stores.get(id) || 'Reseller',
      revenue: formatUsdt(slot.revenue),
      orders: slot.orders,
    }))
    : [];

  const buyerCounts = new Map<string, number>();
  for (const row of paid) {
    const id = text(row.customer_id);
    if (id) buyerCounts.set(id, (buyerCounts.get(id) ?? 0) + 1);
  }
  const repeat = [...buyerCounts.values()].filter((count) => count > 1).length;
  const repeatRate = buyerCounts.size === 0 ? 0 : Math.round((repeat / buyerCounts.size) * 100);
  const average = paid.length === 0 ? 0n : revenueMinor / BigInt(paid.length);
  const pending = current.filter((row) => !['ready', 'failed', 'cancelled'].includes(text(row.fulfillment_status)) && text(row.payment_status) === 'verified').length;
  const attempted = current.filter((row) => text(row.payment_status).length > 0).length;
  const conversion = attempted === 0 ? 0 : Math.round((paid.length / attempted) * 100);
  const previousOrders = paidBefore.length;
  const orderDelta = previousOrders === 0 ? (paid.length > 0 ? 100 : 0) : Math.round(((paid.length - previousOrders) / previousOrders) * 100);

  let live = 0;
  if (scope.role === 'owner' || scope.botId) {
    let liveQuery = db.from('customers').select('id', { count: 'exact', head: true }).gte('updated_at', new Date(now.getTime() - 5 * 60 * 1000).toISOString());
    if (scope.botId) liveQuery = liveQuery.eq('bot_id', scope.botId);
    const liveResult = (await liveQuery) as QueryResult<unknown>;
    live = liveResult.error ? 0 : (liveResult.count ?? 0);
  }

  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const paidHour = paid.filter((row) => text(row.created_at) >= hourAgo).length;
  const browsing = Math.max(live - paidHour, 0);

  const today = await readToday(db, scope);
  const summary = today.items.length === 0
    ? 'Nothing is waiting on you right now.'
    : today.items.slice(0, 2).map((item) => item.problem.replace(/\.$/, '')).join(', and ');

  let supplierBalance = formatUsdt(0n);
  if (scope.role === 'owner') {
    const suppliers = records((await db.from('suppliers').select('balance_usdt').limit(20)) as QueryResult<unknown>);
    const total = suppliers.reduce((sum, row) => {
      try {
        const raw = row.balance_usdt;
        return sum + (raw === null || raw === undefined || raw === '' ? 0n : usdtToMinor(String(raw)));
      } catch {
        return sum;
      }
    }, 0n);
    supplierBalance = formatUsdt(total);
  }

  return {
    role: scope.role,
    firstName: scope.firstName,
    dateLabel: now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: zoned.timeZone }),
    summary,
    range,
    revenue: formatUsdt(revenueMinor),
    revenueMinor: revenueMinor.toString(),
    previousMinor: previousMinor.toString(),
    deltaPercent,
    series,
    legend: {
      owner: formatUsdt(ownerTotal < 0n ? 0n : ownerTotal),
      reseller: formatUsdt(resellerTotal < 0n ? 0n : resellerTotal),
      api: formatUsdt(apiTotal),
    },
    live,
    stages: [
      { label: 'Browsing', value: browsing, color: '#FF4D8D' },
      { label: 'At checkout', value: Math.max(attempted - paid.length, 0), color: '#5B9DFF' },
      { label: 'Paid this hour', value: paidHour, color: '#F5B042' },
    ],
    sales: paid.slice(0, 6).map((row) => ({
      id: text(row.id),
      buyer: names.get(text(row.customer_id)) || 'Buyer',
      product: titles.get(text(row.product_id)) || 'Product',
      store: text(row.tenant_id) ? (stores.get(text(row.tenant_id)) || 'Reseller') : 'Owner store',
      at: text(row.created_at),
      amount: formatUsdt(minor(row.quoted_retail_price)),
    })),
    kpis: [
      { id: 'orders', label: 'Orders', value: String(paid.length), delta: `${orderDelta > 0 ? '+' : ''}${orderDelta}%`, tone: orderDelta > 0 ? 'up' : orderDelta < 0 ? 'down' : 'flat' },
      { id: 'average', label: 'Average order', value: formatUsdt(average), delta: '', tone: 'flat' },
      { id: 'conversion', label: 'Checkout → paid', value: `${conversion}%`, delta: '', tone: 'flat' },
      { id: 'repeat', label: 'Repeat buyers', value: `${repeatRate}%`, delta: '', tone: 'flat' },
      { id: 'pending', label: 'Pending fulfillment', value: String(pending), delta: '', tone: pending > 0 ? 'down' : 'flat' },
      { id: 'supplier', label: 'Supplier balance', value: supplierBalance, delta: '', tone: 'flat' },
    ],
    attention: today.items,
    resellers: topResellers,
    products: topProducts,
  };
}

export function parseOverviewRange(value: string | null): OverviewRange {
  if (value === 'today' || value === '30d' || value === '12m' || value === '7d') return value;
  return '7d';
}
