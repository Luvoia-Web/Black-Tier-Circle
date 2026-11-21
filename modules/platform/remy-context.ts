/**
 * @file modules/platform/remy-context.ts
 *
 * Builds strictly scoped live platform figures to ground Remy AI responses.
 * Owner receives platform-wide metrics (orders, revenue, failed orders with reasons,
 * top products, suppliers & balances, resellers). Resellers receive ONLY their own
 * tenant's orders, revenue, top products, and wallet — never other tenants or supplier details.
 */

import { AppError } from '@/lib/errors';
import { formatUsdt } from '@/lib/money';
import {
  isOrderCanceled,
  isOrderDelivered,
  isOrderFailed,
  orderDisplayStatus,
  orderNeedsAttention,
  type OrderTracks,
} from '@/lib/order-state';
import { getZonedParts, resolveBusinessTimezone, zonedMidnightUtc } from '@/lib/period';
import type { DbClient, QueryResult } from '@/lib/supabase/query';

export type RemyScope = {
  readonly role: 'owner' | 'reseller';
  readonly tenantId: string | null;
  readonly timezone?: string | null;
};

export type RemyPeriodStats = {
  readonly totalOrders: number;
  readonly paidOrders: number;
  readonly deliveredOrders: number;
  readonly failedOrders: number;
  readonly needsAttentionOrders: number;
  readonly awaitingPaymentOrders: number;
  readonly expiredOrders: number;
  readonly canceledOrRefundedOrders: number;
  readonly revenue: string;
};

export type RemyFailedOrderItem = {
  readonly shortId: string;
  readonly date: string;
  readonly inThisMonth: boolean;
  readonly statusLabel: string;
  readonly productTitle: string;
  readonly amount: string;
  readonly reason: string;
};

export type RemyProductItem = {
  readonly title: string;
  readonly units: number;
  readonly revenue: string;
};

export type RemySupplierItem = {
  readonly name: string;
  readonly status: string;
  readonly balanceUsdt: string;
  readonly lastSyncAt: string | null;
  readonly lastSyncError: string | null;
};

export type RemyResellerItem = {
  readonly storeName: string;
  readonly status: string;
  readonly orders: number;
  readonly revenue: string;
  readonly walletBalance: string;
};

export type RemyLiveContext = {
  readonly role: 'owner' | 'reseller';
  readonly asOfDate: string;
  readonly currentMonthLabel: string;
  readonly timeZone: string;
  readonly truncated: boolean;
  readonly periods: {
    readonly today: RemyPeriodStats;
    readonly last7d: RemyPeriodStats;
    readonly thisMonth: RemyPeriodStats;
    readonly last30d: RemyPeriodStats;
    readonly allTime: RemyPeriodStats;
  };
  readonly failedReasonCountsThisMonth: Readonly<Record<string, number>>;
  readonly failedReasonCountsAllTime: Readonly<Record<string, number>>;
  readonly failedOrders: readonly RemyFailedOrderItem[];
  readonly topProducts: readonly RemyProductItem[];
  readonly catalogSummary: {
    readonly published: number;
    readonly total: number;
  };
  readonly suppliers: readonly RemySupplierItem[];
  readonly resellers: {
    readonly total: number;
    readonly active: number;
    readonly pending: number;
    readonly suspended: number;
    readonly top: readonly RemyResellerItem[];
  } | null;
  readonly resellerStore: {
    readonly storeName: string;
    readonly status: string;
    readonly walletBalance: string;
  } | null;
};

const ORDER_FETCH_LIMIT = 2000;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function records(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error) {
    throw new AppError('REMY_CONTEXT_FAILED', result.error.message, 500);
  }
  if (!Array.isArray(result.data)) {
    return [];
  }
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

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function tracksOf(row: Record<string, unknown>): OrderTracks {
  return {
    paymentStatus: text(row.payment_status),
    fulfillmentStatus: text(row.fulfillment_status),
    deliveryStatus: text(row.delivery_status),
  };
}

function summarizeOrders(rows: readonly Record<string, unknown>[]): RemyPeriodStats {
  let totalOrders = 0;
  let paidOrders = 0;
  let deliveredOrders = 0;
  let failedOrders = 0;
  let needsAttentionOrders = 0;
  let awaitingPaymentOrders = 0;
  let expiredOrders = 0;
  let canceledOrRefundedOrders = 0;
  let revenueMinor = 0n;

  for (const row of rows) {
    totalOrders += 1;
    const tracks = tracksOf(row);
    if (tracks.paymentStatus === 'verified') {
      paidOrders += 1;
      revenueMinor += minor(row.quoted_retail_price);
    }
    if (isOrderDelivered(tracks)) {
      deliveredOrders += 1;
      continue;
    }
    if (isOrderCanceled(tracks)) {
      canceledOrRefundedOrders += 1;
      continue;
    }
    if (isOrderFailed(tracks)) {
      failedOrders += 1;
    }
    if (orderNeedsAttention(tracks)) {
      needsAttentionOrders += 1;
    }
    if (tracks.paymentStatus === 'expired') {
      expiredOrders += 1;
    } else if (tracks.paymentStatus === 'awaiting' || tracks.paymentStatus === 'pending_verification') {
      awaitingPaymentOrders += 1;
    }
  }

  return {
    totalOrders,
    paidOrders,
    deliveredOrders,
    failedOrders,
    needsAttentionOrders,
    awaitingPaymentOrders,
    expiredOrders,
    canceledOrRefundedOrders,
    revenue: formatUsdt(revenueMinor),
  };
}

function failureBucketLabel(role: 'owner' | 'reseller', tracks: OrderTracks): string {
  if (tracks.fulfillmentStatus === 'failed') {
    return role === 'owner' ? 'Failed at supplier' : 'Fulfillment failed';
  }
  if (tracks.paymentStatus === 'failed') {
    return 'Payment failed';
  }
  if (tracks.deliveryStatus === 'unreachable') {
    return 'Buyer unreachable on Telegram';
  }
  return 'Failed';
}

function formatDateInZone(iso: string, timeZone: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return 'unknown date';
  const parts = getZonedParts(dt, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function balanceString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }
  const raw = text(value).trim();
  if (!raw) return '0.00';
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : raw;
}

export async function buildRemyLiveContext(
  db: DbClient,
  scope: RemyScope,
  now: Date = new Date(),
): Promise<RemyLiveContext> {
  if (scope.role === 'reseller' && !scope.tenantId) {
    throw new AppError('TENANT_REQUIRED', 'Reseller account is not active', 403);
  }

  const timeZone = resolveBusinessTimezone(scope.timezone);
  const todayParts = getZonedParts(now, timeZone);
  const asOfDate = `${todayParts.year}-${pad2(todayParts.month)}-${pad2(todayParts.day)}`;
  const currentMonthLabel = `${MONTH_NAMES[todayParts.month - 1] ?? 'Month'} ${todayParts.year}`;

  const todayStart = zonedMidnightUtc(todayParts.year, todayParts.month, todayParts.day, timeZone);
  const monthStart = zonedMidnightUtc(todayParts.year, todayParts.month, 1, timeZone);
  const baseUtcDay = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day));
  const sevenDaysAgo = new Date(baseUtcDay);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
  const last7dStart = zonedMidnightUtc(
    sevenDaysAgo.getUTCFullYear(),
    sevenDaysAgo.getUTCMonth() + 1,
    sevenDaysAgo.getUTCDate(),
    timeZone,
  );
  const thirtyDaysAgo = new Date(baseUtcDay);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);
  const last30dStart = zonedMidnightUtc(
    thirtyDaysAgo.getUTCFullYear(),
    thirtyDaysAgo.getUTCMonth() + 1,
    thirtyDaysAgo.getUTCDate(),
    timeZone,
  );

  let ordersQuery = db
    .from('orders')
    .select(
      'id, tenant_id, product_id, quantity, quoted_retail_price, payment_status, fulfillment_status, delivery_status, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(ORDER_FETCH_LIMIT);
  if (scope.role === 'reseller' && scope.tenantId) {
    ordersQuery = ordersQuery.eq('tenant_id', scope.tenantId);
  }
  const allOrders = records((await ordersQuery) as QueryResult<unknown>);
  const truncated = allOrders.length >= ORDER_FETCH_LIMIT;

  const filterSince = (start: Date): Record<string, unknown>[] =>
    allOrders.filter((row) => {
      const ts = Date.parse(text(row.created_at));
      return Number.isFinite(ts) && ts >= start.getTime();
    });

  const todayRows = filterSince(todayStart);
  const last7dRows = filterSince(last7dStart);
  const thisMonthRows = filterSince(monthStart);
  const last30dRows = filterSince(last30dStart);

  const failedRows = allOrders.filter((row) => isOrderFailed(tracksOf(row)));
  const failedIds = failedRows.map((row) => text(row.id)).filter(Boolean).slice(0, 30);

  // Only owner loads raw fulfillment attempt error messages (they may contain supplier API diagnostics).
  const attemptErrorByOrder = new Map<string, string>();
  if (scope.role === 'owner' && failedIds.length > 0) {
    const attempts = records(
      (await db
        .from('fulfillment_attempts')
        .select('order_id, status, error, started_at')
        .in('order_id', failedIds)
        .order('started_at', { ascending: false })
        .limit(120)) as QueryResult<unknown>,
    );
    for (const attempt of attempts) {
      const oid = text(attempt.order_id);
      const err = text(attempt.error).trim();
      if (oid && err && !attemptErrorByOrder.has(oid)) {
        attemptErrorByOrder.set(oid, err.slice(0, 140));
      }
    }
  }

  const paidOrders = allOrders.filter((row) => text(row.payment_status) === 'verified');
  const productIds = [
    ...new Set(
      [...paidOrders, ...failedRows]
        .map((row) => text(row.product_id))
        .filter(Boolean),
    ),
  ].slice(0, 80);

  const productTitleById = new Map<string, string>();
  if (productIds.length > 0) {
    const productRows = records(
      (await db.from('products').select('id, title').in('id', productIds)) as QueryResult<unknown>,
    );
    for (const row of productRows) {
      const id = text(row.id);
      const title = text(row.title);
      if (id && title) {
        productTitleById.set(id, title);
      }
    }
  }

  const byProduct = new Map<string, { units: number; revenueMinor: bigint }>();
  for (const row of paidOrders) {
    const pid = text(row.product_id) || 'unknown';
    const slot = byProduct.get(pid) ?? { units: 0, revenueMinor: 0n };
    slot.units += Number(row.quantity ?? 1) || 1;
    slot.revenueMinor += minor(row.quoted_retail_price);
    byProduct.set(pid, slot);
  }
  const topProducts: RemyProductItem[] = [...byProduct.entries()]
    .sort((left, right) => (right[1].revenueMinor > left[1].revenueMinor ? 1 : -1))
    .slice(0, 8)
    .map(([pid, stats]) => ({
      title: productTitleById.get(pid) ?? 'Product',
      units: stats.units,
      revenue: formatUsdt(stats.revenueMinor),
    }));

  const failedReasonCountsThisMonth: Record<string, number> = {};
  const failedReasonCountsAllTime: Record<string, number> = {};
  const failedOrders: RemyFailedOrderItem[] = [];

  for (const row of failedRows) {
    const id = text(row.id);
    const tracks = tracksOf(row);
    const createdAt = text(row.created_at);
    const createdMs = Date.parse(createdAt);
    const inThisMonth = Number.isFinite(createdMs) && createdMs >= monthStart.getTime();
    const bucket = failureBucketLabel(scope.role, tracks);
    failedReasonCountsAllTime[bucket] = (failedReasonCountsAllTime[bucket] ?? 0) + 1;
    if (inThisMonth) {
      failedReasonCountsThisMonth[bucket] = (failedReasonCountsThisMonth[bucket] ?? 0) + 1;
    }
    if (failedOrders.length < 15) {
      const attemptErr = scope.role === 'owner' ? attemptErrorByOrder.get(id) : undefined;
      const reason = attemptErr ? `${bucket} (${attemptErr})` : bucket;
      failedOrders.push({
        shortId: id.slice(0, 8).toUpperCase(),
        date: formatDateInZone(createdAt, timeZone),
        inThisMonth,
        statusLabel: scope.role === 'owner' ? orderDisplayStatus(tracks).label : bucket,
        productTitle: productTitleById.get(text(row.product_id)) ?? 'Product',
        amount: formatUsdt(minor(row.quoted_retail_price)),
        reason,
      });
    }
  }

  let catalogSummary = { published: 0, total: 0 };
  let suppliers: RemySupplierItem[] = [];
  let resellers: RemyLiveContext['resellers'] = null;
  let resellerStore: RemyLiveContext['resellerStore'] = null;

  if (scope.role === 'owner') {
    const [catalogRows, supplierRows, tenantRows, walletRows] = await Promise.all([
      db.from('products').select('id, status').limit(1000) as PromiseLike<QueryResult<unknown>>,
      db
        .from('suppliers')
        .select('id, name, status, balance_usdt, last_sync_at, last_sync_error')
        .order('name', { ascending: true })
        .limit(100) as PromiseLike<QueryResult<unknown>>,
      db.from('tenants').select('id, display_name, business_name, status').limit(500) as PromiseLike<QueryResult<unknown>>,
      db.from('wallets').select('tenant_id, balance_total').limit(500) as PromiseLike<QueryResult<unknown>>,
    ]);

    const productsList = records(catalogRows);
    catalogSummary = {
      published: productsList.filter((row) => text(row.status) === 'published').length,
      total: productsList.length,
    };

    suppliers = records(supplierRows).map((row) => ({
      name: text(row.name) || 'Supplier',
      status: text(row.status) || 'unknown',
      balanceUsdt: balanceString(row.balance_usdt),
      lastSyncAt: text(row.last_sync_at) || null,
      lastSyncError: text(row.last_sync_error).trim() || null,
    }));

    const walletsByTenant = new Map<string, bigint>();
    for (const row of records(walletRows)) {
      const tid = text(row.tenant_id);
      if (tid) {
        walletsByTenant.set(tid, minor(row.balance_total));
      }
    }

    const salesByTenant = new Map<string, { orders: number; revenueMinor: bigint }>();
    for (const row of paidOrders) {
      const tid = text(row.tenant_id);
      if (!tid) continue;
      const slot = salesByTenant.get(tid) ?? { orders: 0, revenueMinor: 0n };
      slot.orders += 1;
      slot.revenueMinor += minor(row.quoted_retail_price);
      salesByTenant.set(tid, slot);
    }

    const tenantsList = records(tenantRows);
    const active = tenantsList.filter((row) => text(row.status) === 'active').length;
    const pending = tenantsList.filter((row) => text(row.status) === 'pending').length;
    const suspended = tenantsList.filter((row) => text(row.status) === 'suspended').length;
    const topResellers = tenantsList
      .map((row) => {
        const tid = text(row.id);
        const sales = salesByTenant.get(tid) ?? { orders: 0, revenueMinor: 0n };
        return {
          storeName: text(row.business_name) || text(row.display_name) || 'Reseller store',
          status: text(row.status) || 'active',
          orders: sales.orders,
          revenueMinor: sales.revenueMinor,
          revenue: formatUsdt(sales.revenueMinor),
          walletBalance: formatUsdt(walletsByTenant.get(tid) ?? 0n),
        };
      })
      .sort((left, right) => (right.revenueMinor > left.revenueMinor ? 1 : -1))
      .slice(0, 10)
      .map(({ storeName, status, orders, revenue, walletBalance }) => ({
        storeName,
        status,
        orders,
        revenue,
        walletBalance,
      }));

    resellers = {
      total: tenantsList.length,
      active,
      pending,
      suspended,
      top: topResellers,
    };
  } else if (scope.tenantId) {
    const [listingRows, tenantResult, walletResult] = await Promise.all([
      db
        .from('reseller_listings')
        .select('id, is_visible')
        .eq('tenant_id', scope.tenantId)
        .limit(1000) as PromiseLike<QueryResult<unknown>>,
      db
        .from('tenants')
        .select('id, display_name, business_name, status')
        .eq('id', scope.tenantId)
        .limit(1) as PromiseLike<QueryResult<unknown>>,
      db
        .from('wallets')
        .select('tenant_id, balance_total')
        .eq('tenant_id', scope.tenantId)
        .limit(1) as PromiseLike<QueryResult<unknown>>,
    ]);

    const listings = records(listingRows);
    catalogSummary = {
      published: listings.filter((row) => row.is_visible === true).length,
      total: listings.length,
    };

    const ownTenant = records(tenantResult)[0];
    const ownWallet = records(walletResult)[0];
    resellerStore = {
      storeName: text(ownTenant?.business_name) || text(ownTenant?.display_name) || 'Your store',
      status: text(ownTenant?.status) || 'active',
      walletBalance: formatUsdt(minor(ownWallet?.balance_total)),
    };
  }

  return {
    role: scope.role,
    asOfDate,
    currentMonthLabel,
    timeZone,
    truncated,
    periods: {
      today: summarizeOrders(todayRows),
      last7d: summarizeOrders(last7dRows),
      thisMonth: summarizeOrders(thisMonthRows),
      last30d: summarizeOrders(last30dRows),
      allTime: summarizeOrders(allOrders),
    },
    failedReasonCountsThisMonth,
    failedReasonCountsAllTime,
    failedOrders,
    topProducts,
    catalogSummary,
    suppliers,
    resellers,
    resellerStore,
  };
}

function formatPeriodLine(label: string, stats: RemyPeriodStats): string {
  return (
    `- ${label}: ${stats.totalOrders} total orders | ` +
    `${stats.paidOrders} paid (${stats.revenue} revenue) | ` +
    `${stats.deliveredOrders} delivered | ` +
    `${stats.failedOrders} failed | ` +
    `${stats.needsAttentionOrders} needs attention | ` +
    `${stats.awaitingPaymentOrders} awaiting payment | ` +
    `${stats.expiredOrders} expired | ` +
    `${stats.canceledOrRefundedOrders} cancelled/refunded`
  );
}

function formatReasonCounts(counts: Readonly<Record<string, number>>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return 'none (0)';
  return entries.map(([reason, count]) => `${reason}: ${count}`).join('; ');
}

export function formatRemyContextPrompt(ctx: RemyLiveContext): string {
  const lines: string[] = [
    `LIVE PLATFORM DATA (snapshot date: ${ctx.asOfDate}, current month: ${ctx.currentMonthLabel}, timezone: ${ctx.timeZone}, scope: ${ctx.role === 'owner' ? 'platform owner (all stores)' : 'reseller (own store only)'}${ctx.truncated ? ', capped at latest 2000 orders' : ''}):`,
  ];

  if (ctx.resellerStore) {
    lines.push(
      `Your store: ${ctx.resellerStore.storeName} (status: ${ctx.resellerStore.status}, wholesale wallet balance: ${ctx.resellerStore.walletBalance})`,
    );
  }

  lines.push('Orders & revenue by period:');
  lines.push(formatPeriodLine('Today', ctx.periods.today));
  lines.push(formatPeriodLine('Last 7 days', ctx.periods.last7d));
  lines.push(formatPeriodLine(`This month (${ctx.currentMonthLabel})`, ctx.periods.thisMonth));
  lines.push(formatPeriodLine('Last 30 days', ctx.periods.last30d));
  lines.push(formatPeriodLine('All time', ctx.periods.allTime));

  lines.push(
    `Failed order summary: ${ctx.periods.thisMonth.failedOrders} failed in ${ctx.currentMonthLabel} (reasons: ${formatReasonCounts(ctx.failedReasonCountsThisMonth)}); ${ctx.periods.allTime.failedOrders} failed all time (reasons: ${formatReasonCounts(ctx.failedReasonCountsAllTime)}).`,
  );

  if (ctx.failedOrders.length > 0) {
    lines.push('Recent failed orders (all time):');
    for (const item of ctx.failedOrders) {
      lines.push(
        `- Order ${item.shortId} on ${item.date} (${item.inThisMonth ? 'this month' : 'before this month'}): ${item.productTitle}, ${item.amount}, status: ${item.statusLabel}, reason: ${item.reason}`,
      );
    }
  } else {
    lines.push('Recent failed orders: none (0 failed orders).');
  }

  lines.push(
    ctx.role === 'owner'
      ? `Catalog: ${ctx.catalogSummary.published} published products (${ctx.catalogSummary.total} total including draft/paused/archived).`
      : `Store catalog: ${ctx.catalogSummary.published} visible listings (${ctx.catalogSummary.total} total).`,
  );

  if (ctx.topProducts.length > 0) {
    lines.push('Top products by paid revenue:');
    for (const product of ctx.topProducts) {
      lines.push(`- ${product.title}: ${product.units} units, ${product.revenue}`);
    }
  } else {
    lines.push('Top products by paid revenue: none yet.');
  }

  if (ctx.role === 'owner') {
    if (ctx.suppliers.length > 0) {
      lines.push('Suppliers & balances:');
      for (const supplier of ctx.suppliers) {
        const syncNote = supplier.lastSyncError
          ? `last sync error: ${supplier.lastSyncError}`
          : supplier.lastSyncAt
            ? `last synced: ${supplier.lastSyncAt.slice(0, 10)}`
            : 'never synced';
        lines.push(`- ${supplier.name}: status ${supplier.status}, balance ${supplier.balanceUsdt} USDT (${syncNote})`);
      }
    } else {
      lines.push('Suppliers & balances: no suppliers connected.');
    }

    if (ctx.resellers) {
      lines.push(
        `Resellers: ${ctx.resellers.total} total (${ctx.resellers.active} active, ${ctx.resellers.pending} pending, ${ctx.resellers.suspended} suspended).`,
      );
      if (ctx.resellers.top.length > 0) {
        lines.push('Reseller stores:');
        for (const reseller of ctx.resellers.top) {
          lines.push(
            `- ${reseller.storeName} (${reseller.status}): ${reseller.orders} paid orders, ${reseller.revenue} revenue, wallet ${reseller.walletBalance}`,
          );
        }
      }
    }
  }

  return lines.join('\n');
}

export function buildRemySystemPrompt(
  role: 'owner' | 'reseller',
  liveContext: RemyLiveContext,
  memories: readonly { readonly text: string }[] = [],
): string {
  const scopeNote =
    role === 'owner'
      ? 'You are speaking with the platform owner. You can discuss orders, revenue, supplier sync and balances, reseller management, BEP20 verification, warranty replacements, and overall platform metrics.'
      : 'You are speaking with an active reseller store operator. Focus ONLY on their own store: their own orders, revenue, retail margins, Telegram bot, Bot Studio customization, top-up tokens, buyer support, and API keys/webhooks. Never mention suppliers, supplier names, supplier costs, or other stores.';

  const base = `You are Remy, the AI assistant for Black Tier Circle, a multi-tenant Telegram commerce platform for digital products.

${scopeNote}

Key facts about Black Tier Circle:
- Buyers top up USDT (BEP20) or use wallet balance inside Telegram bots
- Owner manages the catalog and suppliers; resellers set retail margins above wholesale
- Warranty replacements are owner-only through Support — buyers never see a Replace button in Telegram bots
- Reseller wholesale wallet top-ups use owner-issued top-up tokens redeemed in Wallets & ledger

STRICT ACCURACY RULES (CRITICAL):
- The LIVE PLATFORM DATA block below is your ONLY source of facts for counts, dates, revenue, failed orders, failure reasons, products, balances, and resellers.
- Use ONLY numbers and reasons present in LIVE PLATFORM DATA. Never invent, estimate, or guess numbers, failure counts, error causes (such as BEP20 errors), dates, or features that are not in LIVE PLATFORM DATA.
- Always distinguish carefully between this month (${liveContext.currentMonthLabel}) and all-time totals. If a count is 0, say 0 plainly.
- If the user asks for a figure or detail that is NOT in LIVE PLATFORM DATA, say plainly that you do not have that data right now and name the dashboard section where they can check it.
- Never let recalled conversation memories override LIVE PLATFORM DATA.

IMPORTANT FORMATTING RULES:
- Never use markdown tables, JSON blocks, code blocks, or bullet lists with dashes
- Write in plain conversational paragraphs only
- Use numbered lists sparingly, only when listing steps
- Keep responses under 150 words unless the user asks for detail
- Sound like a knowledgeable human assistant, not a documentation page

${formatRemyContextPrompt(liveContext)}`;

  if (memories.length === 0) {
    return base;
  }

  const memoryLines = memories
    .slice(0, 5)
    .map((item) => `- ${item.text}`)
    .join('\n');

  return `${base}\n\nBackground notes from earlier chats (use only for tone/context; NEVER override LIVE PLATFORM DATA above):\n${memoryLines}`;
}
