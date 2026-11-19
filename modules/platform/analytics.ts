/**
 * @file modules/platform/analytics.ts
 *
 * Dedicated analytics read model for /analytics (owner and reseller).
 * Scopes strictly to session tenant for resellers and reuses the single
 * order-state & UTC date-window truth shared with Overview and Orders.
 */

import { displayPaymentMethod } from '@/lib/display-labels';
import { AppError } from '@/lib/errors';
import { formatUsdt } from '@/lib/money';
import { isOrderDelivered, orderNeedsAttention } from '@/lib/order-state';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { CHART_COLORS } from '@/components/platform/ui/charts';
import type { OverviewRange } from '@/modules/platform/overview';

export type AnalyticsPayload = {
  readonly role: 'owner' | 'reseller';
  readonly range: OverviewRange;
  readonly rangeLabel: string;
  readonly revenue: string;
  readonly revenueMinor: string;
  readonly previousRevenue: string;
  readonly deltaPercent: number;
  readonly revenueSeries: readonly {
    readonly label: string;
    readonly owner: number;
    readonly reseller: number;
    readonly api: number;
    readonly total: number;
  }[];
  readonly revenueLegend: {
    readonly owner: string;
    readonly reseller: string;
    readonly api: string;
  };
  readonly ordersSeries: readonly {
    readonly label: string;
    readonly delivered: number;
    readonly attention: number;
    readonly unpaid: number;
    readonly total: number;
  }[];
  readonly ordersSummary: {
    readonly total: number;
    readonly paid: number;
    readonly delivered: number;
    readonly attention: number;
    readonly unpaid: number;
  };
  readonly kpis: readonly {
    readonly id: string;
    readonly label: string;
    readonly value: string;
    readonly hint: string;
    readonly delta: string;
    readonly tone: 'up' | 'down' | 'flat';
  }[];
  readonly funnel: readonly {
    readonly label: string;
    readonly value: number;
    readonly rate: string;
    readonly color: string;
  }[];
  readonly channelShare: readonly {
    readonly name: string;
    readonly value: number;
    readonly color: string;
  }[];
  readonly paymentShare: readonly {
    readonly name: string;
    readonly value: number;
    readonly color: string;
  }[];
  readonly topProducts: readonly {
    readonly id: string;
    readonly name: string;
    readonly units: number;
    readonly orders: number;
    readonly revenue: string;
    readonly revenueUsdt: number;
    readonly sharePercent: number;
  }[];
  readonly topResellers: readonly {
    readonly id: string;
    readonly name: string;
    readonly handle: string;
    readonly orders: number;
    readonly revenue: string;
    readonly revenueUsdt: number;
    readonly sharePercent: number;
  }[];
};

const RANGE_LABELS: Record<OverviewRange, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '12m': 'Last 12 months',
};

const PAYMENT_COLORS = [
  CHART_COLORS.rose,
  CHART_COLORS.sky,
  CHART_COLORS.amber,
  CHART_COLORS.mint,
] as const;

export function parseAnalyticsRange(value: string | null): OverviewRange {
  if (value === 'today' || value === '7d' || value === '30d' || value === '12m') {
    return value;
  }
  return '7d';
}

function records(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error) {
    throw new AppError('ANALYTICS_FAILED', result.error.message, 500);
  }
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

function toUsdtNumber(value: bigint): number {
  return Number(value) / 1_000_000;
}

function startFor(range: OverviewRange, now: Date): Date {
  const start = new Date(now);
  if (range === 'today') {
    start.setUTCHours(0, 0, 0, 0);
  } else if (range === '7d') {
    start.setUTCDate(start.getUTCDate() - 6);
    start.setUTCHours(0, 0, 0, 0);
  } else if (range === '30d') {
    start.setUTCDate(start.getUTCDate() - 29);
    start.setUTCHours(0, 0, 0, 0);
  } else {
    start.setUTCMonth(start.getUTCMonth() - 11);
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
  }
  return start;
}

function previousStart(start: Date, now: Date): Date {
  const span = Math.max(86_400_000, now.getTime() - start.getTime());
  return new Date(start.getTime() - span);
}

type TimelineBucket = {
  readonly key: string;
  readonly label: string;
  ownerMinor: bigint;
  resellerMinor: bigint;
  apiMinor: bigint;
  delivered: number;
  attention: number;
  unpaid: number;
  total: number;
};

function buildTimeline(range: OverviewRange, start: Date): TimelineBucket[] {
  const buckets: TimelineBucket[] = [];
  if (range === 'today') {
    for (let hour = 0; hour < 24; hour += 3) {
      buckets.push({
        key: String(hour),
        label: `${String(hour).padStart(2, '0')}:00`,
        ownerMinor: 0n,
        resellerMinor: 0n,
        apiMinor: 0n,
        delivered: 0,
        attention: 0,
        unpaid: 0,
        total: 0,
      });
    }
    return buckets;
  }
  if (range === '12m') {
    for (let i = 0; i < 12; i += 1) {
      const dt = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
      const label = dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
      buckets.push({
        key,
        label,
        ownerMinor: 0n,
        resellerMinor: 0n,
        apiMinor: 0n,
        delivered: 0,
        attention: 0,
        unpaid: 0,
        total: 0,
      });
    }
    return buckets;
  }
  const days = range === '7d' ? 7 : 30;
  for (let i = 0; i < days; i += 1) {
    const dt = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i));
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    const label = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    buckets.push({
      key,
      label,
      ownerMinor: 0n,
      resellerMinor: 0n,
      apiMinor: 0n,
      delivered: 0,
      attention: 0,
      unpaid: 0,
      total: 0,
    });
  }
  return buckets;
}

function bucketKeyForDate(range: OverviewRange, iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  if (range === 'today') {
    return String(Math.floor(dt.getUTCHours() / 3) * 3);
  }
  if (range === '12m') {
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function deltaPct(current: bigint, previous: bigint): { readonly pct: number; readonly label: string; readonly tone: 'up' | 'down' | 'flat' } {
  if (previous === 0n) {
    if (current > 0n) return { pct: 100, label: '+100%', tone: 'up' };
    return { pct: 0, label: '0%', tone: 'flat' };
  }
  const pct = Number(((current - previous) * 100n) / previous);
  return {
    pct,
    label: `${pct > 0 ? '+' : ''}${pct}%`,
    tone: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
  };
}

function emptyPayload(role: 'owner' | 'reseller', range: OverviewRange, start: Date): AnalyticsPayload {
  const buckets = buildTimeline(range, start);
  const zero = formatUsdt(0n);
  return {
    role,
    range,
    rangeLabel: RANGE_LABELS[range],
    revenue: zero,
    revenueMinor: '0',
    previousRevenue: zero,
    deltaPercent: 0,
    revenueSeries: buckets.map((bucket) => ({ label: bucket.label, owner: 0, reseller: 0, api: 0, total: 0 })),
    revenueLegend: { owner: zero, reseller: zero, api: zero },
    ordersSeries: buckets.map((bucket) => ({ label: bucket.label, delivered: 0, attention: 0, unpaid: 0, total: 0 })),
    ordersSummary: { total: 0, paid: 0, delivered: 0, attention: 0, unpaid: 0 },
    kpis: [
      { id: 'revenue', label: 'Gross revenue', value: zero, hint: '0 vs previous period', delta: '', tone: 'flat' },
      { id: 'orders', label: 'Paid orders', value: '0', hint: '0 started total', delta: '', tone: 'flat' },
      { id: 'average', label: 'Average order', value: zero, hint: 'Per paid order', delta: '', tone: 'flat' },
      { id: 'delivery', label: 'Delivery rate', value: '0%', hint: '0 delivered', delta: '', tone: 'flat' },
      { id: 'conversion', label: 'Checkout to paid', value: '0%', hint: '0 paid of 0 started', delta: '', tone: 'flat' },
      { id: 'repeat', label: 'Repeat buyers', value: '0%', hint: '0 active buyers', delta: '', tone: 'flat' },
    ],
    funnel: [
      { label: 'Orders started', value: 0, rate: '0%', color: CHART_COLORS.rose },
      { label: 'Payment verified', value: 0, rate: '0%', color: CHART_COLORS.sky },
      { label: 'Fulfilled', value: 0, rate: '0%', color: CHART_COLORS.amber },
      { label: 'Delivered', value: 0, rate: '0%', color: CHART_COLORS.mint },
    ],
    channelShare: [],
    paymentShare: [],
    topProducts: [],
    topResellers: [],
  };
}

export async function readAnalytics(
  db: DbClient,
  scope: { readonly role: 'owner' | 'reseller'; readonly tenantId: string | null },
  range: OverviewRange,
  now: Date = new Date(),
): Promise<AnalyticsPayload> {
  const start = startFor(range, now);
  if (scope.role === 'reseller' && !scope.tenantId) {
    return emptyPayload('reseller', range, start);
  }
  const prior = previousStart(start, now);
  let query = db
    .from('orders')
    .select(
      'id, tenant_id, channel, payment_method, payment_status, fulfillment_status, delivery_status, quoted_retail_price, quantity, created_at, customer_id, product_id',
    )
    .gte('created_at', prior.toISOString())
    .order('created_at', { ascending: false })
    .limit(2000);
  if (scope.role === 'reseller' && scope.tenantId) {
    query = query.eq('tenant_id', scope.tenantId);
  }
  const rows = records((await query) as QueryResult<unknown>);
  const startMs = start.getTime();
  const nowMs = now.getTime();
  const current = rows.filter((row) => {
    const t = new Date(text(row.created_at)).getTime();
    return Number.isFinite(t) && t >= startMs && t <= nowMs;
  });
  const previous = rows.filter((row) => {
    const t = new Date(text(row.created_at)).getTime();
    return Number.isFinite(t) && t < startMs;
  });

  const paid = current.filter((row) => text(row.payment_status) === 'verified');
  const paidBefore = previous.filter((row) => text(row.payment_status) === 'verified');

  const revenueMinor = paid.reduce((sum, row) => sum + minor(row.quoted_retail_price), 0n);
  const previousMinor = paidBefore.reduce((sum, row) => sum + minor(row.quoted_retail_price), 0n);
  const revenueDelta = deltaPct(revenueMinor, previousMinor);
  const orderDelta = deltaPct(BigInt(paid.length), BigInt(paidBefore.length));

  const timeline = buildTimeline(range, start);
  const bucketMap = new Map(timeline.map((bucket) => [bucket.key, bucket]));

  let ownerTotalMinor = 0n;
  let resellerTotalMinor = 0n;
  let apiTotalMinor = 0n;

  for (const row of paid) {
    const amount = minor(row.quoted_retail_price);
    const channel = text(row.channel);
    const key = bucketKeyForDate(range, text(row.created_at));
    const slot = bucketMap.get(key);
    if (channel === 'api') {
      apiTotalMinor += amount;
      if (slot) slot.apiMinor += amount;
    } else if (channel === 'reseller_bot' || text(row.tenant_id)) {
      resellerTotalMinor += amount;
      if (slot) slot.resellerMinor += amount;
    } else {
      ownerTotalMinor += amount;
      if (slot) slot.ownerMinor += amount;
    }
  }

  let deliveredCount = 0;
  let fulfilledCount = 0;
  let attentionCount = 0;
  let unpaidCount = 0;

  for (const row of current) {
    const tracks = {
      paymentStatus: text(row.payment_status),
      fulfillmentStatus: text(row.fulfillment_status),
      deliveryStatus: text(row.delivery_status),
    };
    const isPaid = tracks.paymentStatus === 'verified';
    const delivered = isOrderDelivered(tracks);
    const attention = orderNeedsAttention(tracks);
    if (delivered) deliveredCount += 1;
    if (delivered || tracks.fulfillmentStatus === 'ready') fulfilledCount += 1;
    if (attention) attentionCount += 1;
    if (!isPaid) unpaidCount += 1;

    const slot = bucketMap.get(bucketKeyForDate(range, text(row.created_at)));
    if (slot) {
      slot.total += 1;
      if (delivered) slot.delivered += 1;
      else if (attention) slot.attention += 1;
      else if (!isPaid) slot.unpaid += 1;
    }
  }

  const productIds = [...new Set(paid.map((row) => text(row.product_id)).filter(Boolean))].slice(0, 60);
  const products = productIds.length === 0
    ? []
    : records((await db.from('products').select('id, title').in('id', productIds)) as QueryResult<unknown>);
  const productTitles = new Map(products.map((row) => [text(row.id), text(row.title)]));

  const byProduct = new Map<string, { units: number; orders: number; revenue: bigint }>();
  for (const row of paid) {
    const id = text(row.product_id) || 'unknown';
    const slot = byProduct.get(id) ?? { units: 0, orders: 0, revenue: 0n };
    slot.units += Number(row.quantity ?? 1) || 1;
    slot.orders += 1;
    slot.revenue += minor(row.quoted_retail_price);
    byProduct.set(id, slot);
  }

  const topProducts = [...byProduct.entries()]
    .sort((a, b) => (a[1].revenue > b[1].revenue ? -1 : 1))
    .slice(0, 8)
    .map(([id, slot]) => ({
      id,
      name: productTitles.get(id) || 'Product',
      units: slot.units,
      orders: slot.orders,
      revenue: formatUsdt(slot.revenue),
      revenueUsdt: toUsdtNumber(slot.revenue),
      sharePercent: revenueMinor > 0n ? Number((slot.revenue * 100n) / revenueMinor) : 0,
    }));

  let topResellers: AnalyticsPayload['topResellers'] = [];
  if (scope.role === 'owner') {
    const tenantIds = [...new Set(paid.map((row) => text(row.tenant_id)).filter(Boolean))].slice(0, 40);
    if (tenantIds.length > 0) {
      const [tenants, bots] = await Promise.all([
        db.from('tenants').select('id, display_name, business_name').in('id', tenantIds) as unknown as Promise<QueryResult<unknown>>,
        db.from('bot_connections').select('tenant_id, username').in('tenant_id', tenantIds) as unknown as Promise<QueryResult<unknown>>,
      ]);
      const storeNames = new Map(
        records(tenants).map((row) => [text(row.id), text(row.business_name) || text(row.display_name) || 'Reseller']),
      );
      const storeHandles = new Map<string, string>();
      for (const row of records(bots)) {
        const tenantId = text(row.tenant_id);
        const username = text(row.username).replace(/^@/, '');
        if (tenantId && username && !storeHandles.has(tenantId)) {
          storeHandles.set(tenantId, `@${username}`);
        }
      }
      const byStore = new Map<string, { orders: number; revenue: bigint }>();
      for (const row of paid) {
        const id = text(row.tenant_id);
        if (!id) continue;
        const slot = byStore.get(id) ?? { orders: 0, revenue: 0n };
        slot.orders += 1;
        slot.revenue += minor(row.quoted_retail_price);
        byStore.set(id, slot);
      }
      topResellers = [...byStore.entries()]
        .sort((a, b) => (a[1].revenue > b[1].revenue ? -1 : 1))
        .slice(0, 8)
        .map(([id, slot]) => ({
          id,
          name: storeNames.get(id) || 'Reseller store',
          handle: storeHandles.get(id) || '',
          orders: slot.orders,
          revenue: formatUsdt(slot.revenue),
          revenueUsdt: toUsdtNumber(slot.revenue),
          sharePercent: revenueMinor > 0n ? Number((slot.revenue * 100n) / revenueMinor) : 0,
        }));
    }
  }

  const buyerCounts = new Map<string, number>();
  for (const row of paid) {
    const id = text(row.customer_id);
    if (id) buyerCounts.set(id, (buyerCounts.get(id) ?? 0) + 1);
  }
  const repeatBuyers = [...buyerCounts.values()].filter((count) => count > 1).length;
  const repeatRate = buyerCounts.size === 0 ? 0 : Math.round((repeatBuyers / buyerCounts.size) * 100);
  const averageMinor = paid.length === 0 ? 0n : revenueMinor / BigInt(paid.length);
  const conversionRate = current.length === 0 ? 0 : Math.round((paid.length / current.length) * 100);
  const deliveryRate = paid.length === 0 ? 0 : Math.round((deliveredCount / paid.length) * 100);

  const byMethod = new Map<string, number>();
  for (const row of paid) {
    const label = displayPaymentMethod(text(row.payment_method) || null);
    byMethod.set(label, (byMethod.get(label) ?? 0) + 1);
  }
  const paymentShare = [...byMethod.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, value], index) => ({
      name,
      value,
      color: PAYMENT_COLORS[index % PAYMENT_COLORS.length] ?? CHART_COLORS.rose,
    }));

  const channelShareRaw = scope.role === 'owner'
    ? [
        { name: 'Owner store', value: toUsdtNumber(ownerTotalMinor), color: CHART_COLORS.rose },
        { name: 'Reseller stores', value: toUsdtNumber(resellerTotalMinor), color: CHART_COLORS.amber },
        { name: 'API', value: toUsdtNumber(apiTotalMinor), color: CHART_COLORS.sky },
      ]
    : [
        { name: 'Bot store', value: toUsdtNumber(resellerTotalMinor), color: CHART_COLORS.rose },
        { name: 'API', value: toUsdtNumber(apiTotalMinor), color: CHART_COLORS.sky },
      ];
  const channelShare = channelShareRaw.filter((slice) => slice.value > 0);

  const startedBase = Math.max(1, current.length);
  const funnel = [
    { label: 'Orders started', value: current.length, rate: current.length > 0 ? '100%' : '0%', color: CHART_COLORS.rose },
    { label: 'Payment verified', value: paid.length, rate: `${Math.round((paid.length / startedBase) * 100)}%`, color: CHART_COLORS.sky },
    { label: 'Fulfilled', value: fulfilledCount, rate: `${Math.round((fulfilledCount / startedBase) * 100)}%`, color: CHART_COLORS.amber },
    { label: 'Delivered', value: deliveredCount, rate: `${Math.round((deliveredCount / startedBase) * 100)}%`, color: CHART_COLORS.mint },
  ];

  return {
    role: scope.role,
    range,
    rangeLabel: RANGE_LABELS[range],
    revenue: formatUsdt(revenueMinor),
    revenueMinor: revenueMinor.toString(),
    previousRevenue: formatUsdt(previousMinor),
    deltaPercent: revenueDelta.pct,
    revenueSeries: timeline.map((bucket) => {
      const total = bucket.ownerMinor + bucket.resellerMinor + bucket.apiMinor;
      return {
        label: bucket.label,
        owner: toUsdtNumber(bucket.ownerMinor),
        reseller: toUsdtNumber(bucket.resellerMinor),
        api: toUsdtNumber(bucket.apiMinor),
        total: toUsdtNumber(total),
      };
    }),
    revenueLegend: {
      owner: formatUsdt(ownerTotalMinor),
      reseller: formatUsdt(resellerTotalMinor),
      api: formatUsdt(apiTotalMinor),
    },
    ordersSeries: timeline.map((bucket) => ({
      label: bucket.label,
      delivered: bucket.delivered,
      attention: bucket.attention,
      unpaid: bucket.unpaid,
      total: bucket.total,
    })),
    ordersSummary: {
      total: current.length,
      paid: paid.length,
      delivered: deliveredCount,
      attention: attentionCount,
      unpaid: unpaidCount,
    },
    kpis: [
      {
        id: 'revenue',
        label: 'Gross revenue',
        value: formatUsdt(revenueMinor),
        hint: `vs ${formatUsdt(previousMinor)} prior`,
        delta: revenueDelta.label,
        tone: revenueDelta.tone,
      },
      {
        id: 'orders',
        label: 'Paid orders',
        value: String(paid.length),
        hint: `${current.length} started total`,
        delta: orderDelta.label,
        tone: orderDelta.tone,
      },
      {
        id: 'average',
        label: 'Average order',
        value: formatUsdt(averageMinor),
        hint: 'Per paid order',
        delta: '',
        tone: 'flat',
      },
      {
        id: 'delivery',
        label: 'Delivery rate',
        value: `${deliveryRate}%`,
        hint: `${deliveredCount} delivered`,
        delta: '',
        tone: deliveryRate >= 90 ? 'up' : paid.length > 0 && deliveryRate < 70 ? 'down' : 'flat',
      },
      {
        id: 'conversion',
        label: 'Checkout to paid',
        value: `${conversionRate}%`,
        hint: `${paid.length} paid of ${current.length}`,
        delta: '',
        tone: 'flat',
      },
      {
        id: 'repeat',
        label: 'Repeat buyers',
        value: `${repeatRate}%`,
        hint: `${buyerCounts.size} active buyers`,
        delta: '',
        tone: 'flat',
      },
    ],
    funnel,
    channelShare,
    paymentShare,
    topProducts,
    topResellers,
  };
}
