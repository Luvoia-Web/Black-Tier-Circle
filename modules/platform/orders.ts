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
  readonly customerLabel: string;
  readonly channel: string;
  readonly paymentStatus: string;
  readonly fulfillmentStatus: string;
  readonly deliveryStatus: string;
  readonly total: string;
  readonly createdAt: string;
};

export type OrderListPage = {
  readonly rows: readonly OrderListRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
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

export function parseOrderFilters(params: URLSearchParams): Filters {
  const requested = Number(params.get('pageSize') ?? '24') || 24;
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
  };
}

const PAYMENT = new Set(['not_required', 'awaiting', 'pending_verification', 'verified', 'failed', 'expired', 'refund_pending', 'refunded', 'disputed']);
const FULFILLMENT = new Set(['queued', 'processing', 'manual_pending', 'supplier_pending', 'outcome_unknown', 'ready', 'failed', 'canceled']);
const DELIVERY = new Set(['not_ready', 'queued', 'sending', 'sent', 'retry_pending', 'unreachable', 'review_required']);

async function scoped(db: DbClient, filters: Filters, tenantId: string | null): Promise<{ readonly query: QueryBuilder<unknown> }> {
  let query = db.from('orders');
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  } else if (filters.store === 'owner') {
    query = query.is('tenant_id', null);
  } else if (UUID.test(filters.store)) {
    query = query.eq('tenant_id', filters.store);
  }
  if (filters.channel === 'owner_store' || filters.channel === 'reseller_bot' || filters.channel === 'api') {
    query = query.eq('channel', filters.channel);
  }
  if (UUID.test(filters.product)) {
    query = query.eq('product_id', filters.product);
  }
  if (UUID.test(filters.customer)) {
    query = query.eq('customer_id', filters.customer);
  }
  if (filters.from) {
    query = query.gte('created_at', filters.from);
  }
  if (filters.to) {
    query = query.lte('created_at', filters.to);
  }
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
    const ids = customers.map((row) => text(row.id)).filter(Boolean);
    const parts = [`external_order_ref.ilike."%${filters.search}%"`];
    if (ids.length > 0) {
      parts.push(`customer_id.in.(${ids.join(',')})`);
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

const COLUMNS = 'id, channel, tenant_id, customer_id, product_id, quoted_retail_price, payment_status, fulfillment_status, delivery_status, created_at';

async function mapRows(db: DbClient, raw: readonly Record<string, unknown>[]): Promise<OrderListRow[]> {
  const productIds = [...new Set(raw.map((row) => text(row.product_id)).filter(Boolean))];
  const customerIds = [...new Set(raw.map((row) => text(row.customer_id)).filter(Boolean))];
  const products = new Map<string, string>();
  const customers = new Map<string, string>();
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
  return raw.map((row) => {
    const minor = typeof row.quoted_retail_price === 'string' || typeof row.quoted_retail_price === 'number' ? BigInt(row.quoted_retail_price) : 0n;
    const id = text(row.id);
    return {
      id,
      productTitle: products.get(text(row.product_id)) || 'Product',
      customerLabel: customers.get(text(row.customer_id)) || 'No buyer',
      channel: text(row.channel),
      paymentStatus: text(row.payment_status),
      fulfillmentStatus: text(row.fulfillment_status),
      deliveryStatus: text(row.delivery_status),
      total: formatUsdt(minor),
      createdAt: text(row.created_at),
    };
  });
}

export async function readOrders(db: DbClient, tenantId: string | null, filters: Filters): Promise<OrderListPage> {
  const base = await scoped(db, filters, tenantId);
  const total = await countOf(base.query);
  const start = (filters.page - 1) * filters.pageSize;
  const listed = (await (await scoped(db, filters, tenantId)).query.select(COLUMNS).order('created_at', { ascending: false }).range(start, start + filters.pageSize - 1)) as QueryResult<unknown>;
  if (listed.error) {
    throw new AppError('ORDER_LIST_FAILED', listed.error.message, 500);
  }
  return { rows: await mapRows(db, records(listed)), total, page: filters.page, pageSize: filters.pageSize };
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
