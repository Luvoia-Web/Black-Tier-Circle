/**
 * @file modules/platform/orders.ts
 *
 * One paged list of orders. Totals come from the database, not the page.
 */

import { AppError } from '@/lib/errors';
import { formatUsdt } from '@/lib/money';
import type { DbClient, QueryBuilder, QueryResult } from '@/lib/supabase/query';

export type OrderListRow = {
  readonly id: string;
  readonly productTitle: string;
  readonly quantity: number;
  readonly customerLabel: string;
  readonly storeLabel: string;
  readonly channel: string;
  readonly paymentStatus: string;
  readonly fulfillmentStatus: string;
  readonly deliveryStatus: string;
  readonly total: string;
  readonly createdAt: string;
};

export type OrderChip = 'all' | 'attention' | 'awaiting' | 'fulfilling' | 'delivered' | 'failed' | 'expired';

export type OrderStoreOption = {
  readonly id: string;
  readonly label: string;
};

export type OrderSummary = {
  readonly ordersToday: number;
  readonly revenueTodayMinor: string;
  readonly needsAttention: number;
  readonly medianDeliverySeconds: number | null;
  readonly chips: Record<OrderChip, number>;
  readonly stores: readonly OrderStoreOption[];
};

export type OrderListPage = {
  readonly rows: readonly OrderListRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly summary: OrderSummary;
};

const PAGE_SIZES = [24, 48, 96] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Filters = {
  readonly page: number;
  readonly pageSize: number;
  readonly search: string;
  readonly state: string;
  readonly channel: string;
  readonly store: string;
  readonly product: string;
  readonly customer: string;
  readonly from: string;
  readonly to: string;
  readonly chip: OrderChip;
  readonly attention: '' | 'fulfillment' | 'delivery';
  readonly range: '' | 'today' | '7d' | '30d' | 'all';
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

function safe(raw: string): string {
  return raw.replace(/[%_,."']/g, '').trim().slice(0, 64);
}

const CHIPS: readonly OrderChip[] = ['all', 'attention', 'awaiting', 'fulfilling', 'delivered', 'failed', 'expired'];

function chipOf(raw: string): OrderChip {
  return CHIPS.includes(raw as OrderChip) ? (raw as OrderChip) : 'all';
}

export function parseOrderFilters(params: URLSearchParams): Filters {
  const requested = Number(params.get('pageSize') ?? '24') || 24;
  const attention = params.get('attention');
  const range = params.get('range');
  return {
    page: Math.max(1, Number(params.get('page') ?? '1') || 1),
    pageSize: PAGE_SIZES.includes(requested as (typeof PAGE_SIZES)[number]) ? requested : 24,
    search: safe(params.get('q') ?? ''),
    state: text(params.get('state')),
    channel: text(params.get('channel')),
    store: text(params.get('store')),
    product: text(params.get('product')),
    customer: text(params.get('customer')),
    from: text(params.get('from')),
    to: text(params.get('to')),
    chip: chipOf(text(params.get('chip'))),
    attention: attention === 'fulfillment' || attention === 'delivery' ? attention : '',
    range: range === 'today' || range === '7d' || range === '30d' || range === 'all' ? range : '',
  };
}

function startOfToday(): string {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  return day.toISOString();
}

function rangeStart(filters: Filters): string {
  if (filters.from) return filters.from;
  if (filters.range === 'today') return startOfToday();
  if (filters.range === '7d') return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (filters.range === '30d') return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return '';
}

const PAYMENT = new Set(['not_required', 'awaiting', 'pending_verification', 'verified', 'failed', 'expired', 'refund_pending', 'refunded', 'disputed']);
const FULFILLMENT = new Set(['queued', 'processing', 'manual_pending', 'supplier_pending', 'outcome_unknown', 'ready', 'failed', 'canceled']);
const DELIVERY = new Set(['not_ready', 'queued', 'sending', 'sent', 'retry_pending', 'unreachable', 'review_required']);

function applyQueue(query: QueryBuilder<unknown>, filters: Filters): QueryBuilder<unknown> {
  if (filters.attention === 'fulfillment') {
    return query.or('fulfillment_status.eq.failed,fulfillment_status.eq.manual_pending,fulfillment_status.eq.outcome_unknown,fulfillment_status.eq.queued');
  }
  if (filters.attention === 'delivery') {
    return query.or('fulfillment_status.eq.manual_pending,delivery_status.eq.review_required');
  }
  if (filters.chip === 'attention') {
    return query.or('payment_status.eq.failed,payment_status.eq.disputed,fulfillment_status.eq.failed,fulfillment_status.eq.manual_pending,fulfillment_status.eq.outcome_unknown,delivery_status.eq.retry_pending,delivery_status.eq.unreachable,delivery_status.eq.review_required');
  }
  if (filters.chip === 'awaiting') {
    return query.in('payment_status', ['awaiting', 'pending_verification']);
  }
  if (filters.chip === 'fulfilling') {
    return query.in('fulfillment_status', ['queued', 'processing', 'supplier_pending', 'manual_pending']);
  }
  if (filters.chip === 'delivered') {
    return query.eq('delivery_status', 'sent');
  }
  if (filters.chip === 'failed') {
    return query.or('fulfillment_status.eq.failed,payment_status.eq.failed,delivery_status.eq.unreachable');
  }
  if (filters.chip === 'expired') {
    return query.eq('payment_status', 'expired');
  }
  return query;
}

async function scoped(db: DbClient, filters: Filters, tenantId: string | null): Promise<{ readonly query: QueryBuilder<unknown> }> {
  let query = db.from('orders');
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  } else if (filters.store === 'api') {
    query = query.eq('channel', 'api');
  } else if (filters.store === 'owner') {
    query = query.is('tenant_id', null);
  } else if (UUID.test(filters.store)) {
    query = query.eq('tenant_id', filters.store);
  }
  if (filters.store !== 'api' && (filters.channel === 'owner_store' || filters.channel === 'reseller_bot' || filters.channel === 'api')) {
    query = query.eq('channel', filters.channel);
  }
  if (UUID.test(filters.product)) {
    query = query.eq('product_id', filters.product);
  }
  if (UUID.test(filters.customer)) {
    query = query.eq('customer_id', filters.customer);
  }
  const from = rangeStart(filters);
  if (from) {
    query = query.gte('created_at', from);
  }
  if (filters.to) {
    query = query.lte('created_at', filters.to);
  }
  query = applyQueue(query, filters);
  if (filters.state.startsWith('payment:') && PAYMENT.has(filters.state.slice(8))) {
    query = query.eq('payment_status', filters.state.slice(8));
  } else if (filters.state.startsWith('fulfillment:') && FULFILLMENT.has(filters.state.slice(12))) {
    query = query.eq('fulfillment_status', filters.state.slice(12));
  } else if (filters.state.startsWith('delivery:') && DELIVERY.has(filters.state.slice(9))) {
    query = query.eq('delivery_status', filters.state.slice(9));
  }
  if (UUID.test(filters.search)) {
    query = query.eq('id', filters.search);
  } else if (filters.search) {
    const customers = records((await db.from('customers').select('id').or(`username.ilike."%${filters.search}%",first_name.ilike."%${filters.search}%"`).limit(30)) as QueryResult<unknown>);
    const products = records((await db.from('products').select('id').or(`title.ilike."%${filters.search}%",sku.ilike."%${filters.search}%"`).limit(30)) as QueryResult<unknown>);
    const ids = customers.map((row) => text(row.id)).filter(Boolean);
    const productIds = products.map((row) => text(row.id)).filter(Boolean);
    const parts = [`external_order_ref.ilike."%${filters.search}%"`];
    if (ids.length > 0) {
      parts.push(`customer_id.in.(${ids.join(',')})`);
    }
    if (productIds.length > 0) {
      parts.push(`product_id.in.(${productIds.join(',')})`);
    }
    query = query.or(parts.join(','));
  }
  return { query };
}

async function countOf(query: QueryBuilder<unknown>): Promise<number> {
  const result = (await query.select('id', { count: 'exact', head: true })) as QueryResult<unknown>;
  if (result.error) {
    throw new AppError('ORDER_LIST_FAILED', result.error.message, 500);
  }
  return result.count ?? 0;
}

const COLUMNS = 'id, channel, tenant_id, customer_id, product_id, quantity, quoted_retail_price, payment_status, fulfillment_status, delivery_status, created_at';

async function mapRows(db: DbClient, raw: readonly Record<string, unknown>[]): Promise<OrderListRow[]> {
  const productIds = [...new Set(raw.map((row) => text(row.product_id)).filter(Boolean))];
  const customerIds = [...new Set(raw.map((row) => text(row.customer_id)).filter(Boolean))];
  const products = new Map<string, string>();
  const customers = new Map<string, string>();
  const stores = new Map<string, string>();
  const tenantIds = [...new Set(raw.map((row) => text(row.tenant_id)).filter(Boolean))];
  if (productIds.length > 0) {
    for (const row of records((await db.from('products').select('id, title').in('id', productIds)) as QueryResult<unknown>)) {
      products.set(text(row.id), text(row.title));
    }
  }
  if (customerIds.length > 0) {
    for (const row of records((await db.from('customers').select('id, username, first_name').in('id', customerIds)) as QueryResult<unknown>)) {
      customers.set(text(row.id), text(row.username) ? `@${text(row.username)}` : text(row.first_name) || text(row.id).slice(0, 8));
    }
  }
  if (tenantIds.length > 0) {
    for (const row of records((await db.from('tenants').select('id, display_name').in('id', tenantIds)) as QueryResult<unknown>)) {
      stores.set(text(row.id), text(row.display_name) || 'Reseller store');
    }
  }
  return raw.map((row) => {
    const minor = typeof row.quoted_retail_price === 'string' || typeof row.quoted_retail_price === 'number' ? BigInt(row.quoted_retail_price) : 0n;
    const id = text(row.id);
    const tenant = text(row.tenant_id);
    const channel = text(row.channel);
    const quantity = typeof row.quantity === 'number' ? row.quantity : Number(row.quantity ?? 1) || 1;
    return {
      id,
      productTitle: products.get(text(row.product_id)) || 'Product',
      quantity,
      customerLabel: customers.get(text(row.customer_id)) || 'No buyer',
      storeLabel: channel === 'api' ? 'API' : tenant ? stores.get(tenant) || 'Reseller store' : 'Owner store',
      channel,
      paymentStatus: text(row.payment_status),
      fulfillmentStatus: text(row.fulfillment_status),
      deliveryStatus: text(row.delivery_status),
      total: formatUsdt(minor),
      createdAt: text(row.created_at),
    };
  });
}

function quiet(filters: Filters, patch: Partial<Filters>): Filters {
  return { ...filters, search: '', state: '', chip: 'all', attention: '', range: '', from: '', to: '', page: 1, ...patch };
}

function windowed(filters: Filters, patch: Partial<Filters>): Filters {
  return { ...filters, search: '', state: '', chip: 'all', attention: '', page: 1, ...patch };
}

async function tally(db: DbClient, tenantId: string | null, filters: Filters): Promise<number> {
  return countOf((await scoped(db, filters, tenantId)).query);
}

function medianSeconds(rows: readonly Record<string, unknown>[]): number | null {
  const samples = rows
    .map((row) => {
      const start = Date.parse(text(row.created_at));
      const end = Date.parse(text(row.updated_at));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
      return Math.round((end - start) / 1000);
    })
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  if (samples.length === 0) return null;
  const mid = Math.floor(samples.length / 2);
  const median = samples.length % 2 === 1 ? samples[mid] : Math.round(((samples[mid - 1] ?? 0) + (samples[mid] ?? 0)) / 2);
  return median ?? null;
}

async function summarize(db: DbClient, tenantId: string | null, filters: Filters): Promise<OrderSummary> {
  const today = quiet(filters, { from: startOfToday() });
  const base = windowed(filters, {});
  const [ordersToday, needsAttention, attention, awaiting, fulfilling, delivered, failed, expired, all, revenueRows, deliveredRows, storeRows] = await Promise.all([
    tally(db, tenantId, today),
    tally(db, tenantId, quiet(filters, { chip: 'attention' })),
    tally(db, tenantId, { ...base, chip: 'attention' }),
    tally(db, tenantId, { ...base, chip: 'awaiting' }),
    tally(db, tenantId, { ...base, chip: 'fulfilling' }),
    tally(db, tenantId, { ...base, chip: 'delivered' }),
    tally(db, tenantId, { ...base, chip: 'failed' }),
    tally(db, tenantId, { ...base, chip: 'expired' }),
    tally(db, tenantId, base),
    (await scoped(db, quiet(filters, { from: startOfToday() }), tenantId)).query.select('quoted_retail_price').eq('payment_status', 'verified').limit(2000) as unknown as Promise<QueryResult<unknown>>,
    (await scoped(db, quiet(filters, { from: startOfToday(), chip: 'delivered' }), tenantId)).query.select('created_at, updated_at').limit(200) as unknown as Promise<QueryResult<unknown>>,
    tenantId ? Promise.resolve({ data: [], error: null } as QueryResult<unknown>) : (db.from('tenants').select('id, display_name').order('display_name', { ascending: true }).limit(100) as unknown as Promise<QueryResult<unknown>>),
  ]);
  if (revenueRows.error) throw new AppError('ORDER_LIST_FAILED', revenueRows.error.message, 500);
  if (deliveredRows.error) throw new AppError('ORDER_LIST_FAILED', deliveredRows.error.message, 500);
  const revenueTodayMinor = records(revenueRows).reduce((sum, row) => {
    try {
      return sum + BigInt(typeof row.quoted_retail_price === 'string' || typeof row.quoted_retail_price === 'number' ? row.quoted_retail_price : 0);
    } catch {
      return sum;
    }
  }, 0n);
  const stores: OrderStoreOption[] = tenantId
    ? []
    : [
        { id: 'owner', label: 'Owner store' },
        ...records(storeRows).map((row) => ({ id: text(row.id), label: text(row.display_name) || 'Reseller store' })),
        { id: 'api', label: 'API' },
      ];
  return {
    ordersToday,
    revenueTodayMinor: revenueTodayMinor.toString(),
    needsAttention,
    medianDeliverySeconds: medianSeconds(records(deliveredRows)),
    chips: { all, attention, awaiting, fulfilling, delivered, failed, expired },
    stores,
  };
}

export async function readOrders(db: DbClient, tenantId: string | null, filters: Filters): Promise<OrderListPage> {
  const base = await scoped(db, filters, tenantId);
  const total = await countOf(base.query);
  const start = (filters.page - 1) * filters.pageSize;
  const listed = (await (await scoped(db, filters, tenantId)).query.select(COLUMNS).order('created_at', { ascending: false }).range(start, start + filters.pageSize - 1)) as QueryResult<unknown>;
  if (listed.error) {
    throw new AppError('ORDER_LIST_FAILED', listed.error.message, 500);
  }
  const [rows, summary] = await Promise.all([mapRows(db, records(listed)), summarize(db, tenantId, filters)]);
  return { rows, total, page: filters.page, pageSize: filters.pageSize, summary };
}

export async function readOrdersCsv(db: DbClient, tenantId: string | null, filters: Filters): Promise<string> {
  const listed = (await (await scoped(db, filters, tenantId)).query.select(COLUMNS).order('created_at', { ascending: false }).limit(2000)) as QueryResult<unknown>;
  if (listed.error) {
    throw new AppError('ORDER_LIST_FAILED', listed.error.message, 500);
  }
  const rows = await mapRows(db, records(listed));
  const header = 'id,product,customer,channel,payment,fulfillment,delivery,total,created';
  const body = rows.map((row) => [row.id, row.productTitle, row.customerLabel, row.channel, row.paymentStatus, row.fulfillmentStatus, row.deliveryStatus, row.total, row.createdAt].map(csvCell).join(','));
  return [header, ...body].join('\n');
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
