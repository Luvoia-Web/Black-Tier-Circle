/**
 * @file modules/platform/people.ts
 *
 * Buyers and resellers for the People / Customers directory and detail views.
 */

import {
  displayAuditAction,
  displayReplacementStatus,
  displaySupportStatus,
  displayTopupStatus,
  formatPlainDatesInText,
} from '@/lib/display-labels';
import { AppError } from '@/lib/errors';
import { formatUsdt } from '@/lib/money';
import { isOrderDelivered, orderDisplayStatus, type OrderTone } from '@/lib/order-state';
import { idsMatching, limitToIds } from '@/lib/row-ids';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { getWallet } from '@/modules/wallet';

export type PersonRow = {
  readonly id: string;
  readonly kind: 'buyer' | 'reseller';
  readonly name: string;
  readonly storeName: string;
  readonly balance: string;
  readonly balanceMinor: string;
  readonly orders: number;
  readonly spent: string;
  readonly openThreads: number;
  readonly unreadSupport: boolean;
  readonly flagged: boolean;
  readonly lastSeen: string;
  readonly state: string;
};

export type PeopleSummary = {
  readonly totalBuyers: number;
  readonly activeBuyers: number;
  readonly blockedBuyers: number;
  readonly unreadSupport: number;
  readonly flaggedBuyers: number;
  readonly totalBalance: string;
};

export type PeoplePayload = {
  readonly rows: readonly PersonRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly summary?: PeopleSummary;
};

export type BuyerOrderItem = {
  readonly id: string;
  readonly shortId: string;
  readonly productTitle: string;
  readonly quantity: number;
  readonly total: string;
  readonly status: string;
  readonly tone: OrderTone;
  readonly delivered: boolean;
  readonly hasSupplier: boolean;
  readonly at: string;
};

export type BuyerTopupItem = {
  readonly id: string;
  readonly amount: string;
  readonly status: string;
  readonly rawStatus: string;
  readonly at: string;
};

export type BuyerSupportThreadItem = {
  readonly id: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly unread: boolean;
  readonly lastMessageAt: string;
  readonly preview: string;
};

export type BuyerFlagItem = {
  readonly id: string;
  readonly label: string;
  readonly reason: string;
  readonly at: string;
  readonly severity: 'fault' | 'warn' | 'info';
};

export type BuyerReplacementItem = {
  readonly id: string;
  readonly orderId: string;
  readonly shortId: string;
  readonly status: string;
  readonly reason: string;
  readonly at: string;
};

export type PersonDetail = {
  readonly id: string;
  readonly kind: 'buyer' | 'reseller';
  readonly name: string;
  readonly username: string | null;
  readonly firstName: string;
  readonly telegramId: string;
  readonly storeName: string;
  readonly state: string;
  readonly balance: string;
  readonly balanceMinor: string;
  readonly joinedAt: string;
  readonly lastSeen: string;
  readonly blockedAt: string | null;
  readonly blockedReason: string | null;
  readonly wallet: {
    readonly balance: string;
    readonly balanceMinor: string;
    readonly points: number;
    readonly topups: readonly BuyerTopupItem[];
  };
  readonly orders: readonly BuyerOrderItem[];
  readonly referrals: readonly string[];
  readonly threads: readonly string[];
  readonly supportThreads: readonly BuyerSupportThreadItem[];
  readonly flags: readonly BuyerFlagItem[];
  readonly replacements: readonly BuyerReplacementItem[];
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

function safeRecords(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error || !Array.isArray(result.data)) {
    return [];
  }
  return result.data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function minor(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' || typeof value === 'number') {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function pageSize(value: number): number {
  return value === 48 || value === 96 ? value : 24;
}

function safeTerm(value: string): string {
  return value.replace(/[%_,."']/g, '').trim().slice(0, 80);
}

function isFlagAuditAction(action: string): boolean {
  return action.startsWith('fraud.') || action === 'claim.failed';
}

function flagSeverity(action: string): 'fault' | 'warn' | 'info' {
  if (action.startsWith('fraud.') || action === 'claim.failed' || action === 'customer.block' || action === 'customer.freeze') {
    return 'fault';
  }
  if (action === 'customer.debit') {
    return 'warn';
  }
  return 'info';
}

async function resolveBotStoreNames(db: DbClient): Promise<Map<string, string>> {
  const [botsRes, tenantsRes] = await Promise.all([
    db.from('bot_connections').select('id, tenant_id').limit(200) as unknown as Promise<QueryResult<unknown>>,
    db.from('tenants').select('id, display_name, business_name').limit(200) as unknown as Promise<QueryResult<unknown>>,
  ]);
  const tenants = new Map<string, string>();
  for (const row of safeRecords(tenantsRes)) {
    const id = text(row.id);
    if (id) tenants.set(id, text(row.business_name) || text(row.display_name) || 'Reseller store');
  }
  const byBot = new Map<string, string>();
  for (const row of safeRecords(botsRes)) {
    const botId = text(row.id);
    const tenantId = text(row.tenant_id);
    if (botId) byBot.set(botId, tenants.get(tenantId) ?? 'Reseller store');
  }
  return byBot;
}

export async function readPeople(
  db: DbClient,
  input: {
    readonly role: 'owner' | 'reseller';
    readonly tenantId: string | null;
    readonly botId: string | null;
    readonly kind: string;
    readonly q: string;
    readonly state?: string;
    readonly page: number;
    readonly pageSize: number;
  },
): Promise<PeoplePayload> {
  const size = pageSize(input.pageSize);
  const page = Math.max(1, input.page);
  const from = (page - 1) * size;
  const term = safeTerm(input.q);

  if (input.kind === 'reseller') {
    if (input.role !== 'owner') {
      return { rows: [], total: 0, page, pageSize: size };
    }
    let query = db.from('tenants').select('id, display_name, status, updated_at', { count: 'exact' }).order('updated_at', { ascending: false });
    if (term) {
      query = limitToIds(query, await idsMatching(db, 'tenants', ['display_name'], term));
    }
    const result = (await query.range(from, from + size - 1)) as QueryResult<unknown>;
    const rows = records(result).map((row) => ({
      id: text(row.id),
      kind: 'reseller' as const,
      name: text(row.display_name) || 'Reseller',
      storeName: text(row.display_name) || 'Reseller',
      balance: '—',
      balanceMinor: '0',
      orders: 0,
      spent: '0.00 USDT',
      openThreads: 0,
      unreadSupport: false,
      flagged: false,
      lastSeen: text(row.updated_at),
      state: text(row.status) || 'unknown',
    }));
    return { rows, total: result.count ?? rows.length, page, pageSize: size };
  }

  if (input.role === 'reseller' && !input.botId) {
    return {
      rows: [],
      total: 0,
      page,
      pageSize: size,
      summary: { totalBuyers: 0, activeBuyers: 0, blockedBuyers: 0, unreadSupport: 0, flaggedBuyers: 0, totalBalance: formatUsdt(0n) },
    };
  }

  let scopedQuery = db
    .from('customers')
    .select('id, bot_id, telegram_user_id, username, first_name, credit_balance, is_blocked, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1000);
  if (input.role === 'reseller' && input.botId) {
    scopedQuery = scopedQuery.eq('bot_id', input.botId);
  }

  let threadQuery = db.from('support_threads').select('id, customer_id, status, unread_for_owner').limit(500);
  if (input.role === 'reseller' && input.tenantId) {
    threadQuery = threadQuery.eq('tenant_id', input.tenantId);
  }

  const [customersRes, threadsRes, auditRes, botStores] = await Promise.all([
    scopedQuery as unknown as Promise<QueryResult<unknown>>,
    threadQuery as unknown as Promise<QueryResult<unknown>>,
    db
      .from('audit_log')
      .select('target_id, action')
      .eq('target_type', 'customer')
      .order('created_at', { ascending: false })
      .limit(400) as unknown as Promise<QueryResult<unknown>>,
    resolveBotStoreNames(db),
  ]);

  const allBuyers = records(customersRes);
  const flaggedSet = new Set<string>();
  for (const audit of safeRecords(auditRes)) {
    const action = text(audit.action);
    const targetId = text(audit.target_id);
    if (targetId && isFlagAuditAction(action)) {
      flaggedSet.add(targetId);
    }
  }

  const threadCounts = new Map<string, { open: number; unread: boolean }>();
  let totalUnreadThreads = 0;
  for (const thread of safeRecords(threadsRes)) {
    const cid = text(thread.customer_id);
    const unread = thread.unread_for_owner === true;
    if (unread) totalUnreadThreads += 1;
    if (!cid) continue;
    const prev = threadCounts.get(cid) ?? { open: 0, unread: false };
    if (text(thread.status) === 'open') prev.open += 1;
    if (unread) prev.unread = true;
    threadCounts.set(cid, prev);
  }

  let activeBuyers = 0;
  let blockedBuyers = 0;
  let flaggedBuyers = 0;
  let totalBalanceMinor = 0n;
  for (const buyer of allBuyers) {
    const id = text(buyer.id);
    const isBlocked = buyer.is_blocked === true;
    if (isBlocked) blockedBuyers += 1;
    else activeBuyers += 1;
    if (isBlocked || flaggedSet.has(id)) flaggedBuyers += 1;
    totalBalanceMinor += minor(buyer.credit_balance);
  }

  const stateFilter = input.state ?? 'all';
  const termLower = term.toLowerCase();
  const filtered = allBuyers.filter((row) => {
    const id = text(row.id);
    const isBlocked = row.is_blocked === true;
    const isFlagged = isBlocked || flaggedSet.has(id);
    if (stateFilter === 'active' && isBlocked) return false;
    if (stateFilter === 'blocked' && !isBlocked) return false;
    if (stateFilter === 'flagged' && !isFlagged) return false;
    if (termLower) {
      const hay = `${text(row.username)} ${text(row.first_name)} ${text(row.telegram_user_id)}`.toLowerCase();
      if (!hay.includes(termLower)) return false;
    }
    return true;
  });

  const paged = filtered.slice(from, from + size);
  const pageIds = paged.map((row) => text(row.id)).filter(Boolean);
  const orderRows = pageIds.length
    ? records(
        (await db
          .from('orders')
          .select('customer_id, payment_status, quoted_retail_price')
          .in('customer_id', pageIds)
          .limit(2000)) as QueryResult<unknown>,
      )
    : [];

  const counts = new Map<string, number>();
  const spend = new Map<string, bigint>();
  for (const order of orderRows) {
    const id = text(order.customer_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (text(order.payment_status) === 'verified') {
      spend.set(id, (spend.get(id) ?? 0n) + minor(order.quoted_retail_price));
    }
  }

  const rows: PersonRow[] = paged.map((row) => {
    const id = text(row.id);
    const botId = text(row.bot_id);
    const name = text(row.username) ? `@${text(row.username)}` : text(row.first_name) || 'Buyer';
    const balanceVal = minor(row.credit_balance);
    const threadStats = threadCounts.get(id) ?? { open: 0, unread: false };
    const isBlocked = row.is_blocked === true;
    return {
      id,
      kind: 'buyer',
      name,
      storeName: botId ? (botStores.get(botId) ?? 'Reseller store') : 'Owner store',
      balance: formatUsdt(balanceVal),
      balanceMinor: balanceVal.toString(),
      orders: counts.get(id) ?? 0,
      spent: formatUsdt(spend.get(id) ?? 0n),
      openThreads: threadStats.open,
      unreadSupport: threadStats.unread,
      flagged: isBlocked || flaggedSet.has(id),
      lastSeen: text(row.updated_at) || text(row.created_at),
      state: isBlocked ? 'blocked' : 'active',
    };
  });

  return {
    rows,
    total: filtered.length,
    page,
    pageSize: size,
    summary: {
      totalBuyers: allBuyers.length,
      activeBuyers,
      blockedBuyers,
      unreadSupport: totalUnreadThreads,
      flaggedBuyers,
      totalBalance: formatUsdt(totalBalanceMinor),
    },
  };
}

export async function readPerson(
  db: DbClient,
  input: {
    readonly id: string;
    readonly kind: string;
    readonly role: 'owner' | 'reseller';
    readonly tenantId?: string | null;
    readonly botId: string | null;
  },
): Promise<PersonDetail | null> {
  if (input.kind === 'reseller') {
    if (input.role !== 'owner') {
      return null;
    }
    const tenant = (await db.from('tenants').select('id, display_name, business_name, status, created_at, updated_at').eq('id', input.id).maybeSingle()) as QueryResult<unknown>;
    const row = tenant.data && typeof tenant.data === 'object' ? (tenant.data as Record<string, unknown>) : null;
    if (!row) {
      return null;
    }
    let balance = formatUsdt(0n);
    let balanceMinor = '0';
    try {
      const wallet = await getWallet(db, input.id);
      balance = formatUsdt(wallet.balanceAvailable);
      balanceMinor = wallet.balanceAvailable.toString();
    } catch {
      balance = 'No wallet yet';
    }
    const name = text(row.business_name) || text(row.display_name) || 'Reseller';
    return {
      id: text(row.id),
      kind: 'reseller',
      name,
      username: null,
      firstName: name,
      telegramId: '',
      storeName: name,
      state: text(row.status),
      balance,
      balanceMinor,
      joinedAt: text(row.created_at),
      lastSeen: text(row.updated_at),
      blockedAt: null,
      blockedReason: null,
      wallet: { balance, balanceMinor, points: 0, topups: [] },
      orders: [],
      referrals: [],
      threads: [],
      supportThreads: [],
      flags: [],
      replacements: [],
    };
  }

  const customer = (await db
    .from('customers')
    .select('id, username, first_name, telegram_user_id, credit_balance, is_blocked, blocked_at, blocked_reason, bot_id, created_at, updated_at')
    .eq('id', input.id)
    .maybeSingle()) as QueryResult<unknown>;
  const row = customer.data && typeof customer.data === 'object' ? (customer.data as Record<string, unknown>) : null;
  if (!row) {
    return null;
  }
  if (input.role === 'reseller' && (!input.botId || text(row.bot_id) !== input.botId)) {
    return null;
  }

  const botStores = text(row.bot_id) ? await resolveBotStoreNames(db) : new Map<string, string>();
  const storeName = text(row.bot_id) ? (botStores.get(text(row.bot_id)) ?? 'Reseller store') : 'Owner store';

  let buyerOrdersQuery = db
    .from('orders')
    .select('id, product_id, quantity, quoted_retail_price, payment_status, fulfillment_status, delivery_status, created_at')
    .eq('customer_id', input.id)
    .order('created_at', { ascending: false })
    .limit(15);
  let buyerThreadsQuery = db
    .from('support_threads')
    .select('id, status, unread_for_owner, last_message_at')
    .eq('customer_id', input.id)
    .order('last_message_at', { ascending: false })
    .limit(10);
  if (input.role === 'reseller' && input.tenantId) {
    buyerOrdersQuery = buyerOrdersQuery.eq('tenant_id', input.tenantId);
    buyerThreadsQuery = buyerThreadsQuery.eq('tenant_id', input.tenantId);
  }

  const [ordersRes, referralsRes, threadsRes, topupsRes, pointsRes, auditsRes, replacementsRes] = await Promise.all([
    buyerOrdersQuery as unknown as Promise<QueryResult<unknown>>,
    db
      .from('customers')
      .select('username, first_name')
      .eq('referred_by_customer_id', input.id)
      .limit(8) as unknown as Promise<QueryResult<unknown>>,
    buyerThreadsQuery as unknown as Promise<QueryResult<unknown>>,
    db
      .from('wallet_topups')
      .select('id, amount_expected_minor, credited_amount_minor, status, created_at')
      .eq('customer_id', input.id)
      .order('created_at', { ascending: false })
      .limit(8) as unknown as Promise<QueryResult<unknown>>,
    db
      .from('points_ledger')
      .select('delta')
      .eq('customer_id', input.id)
      .limit(500) as unknown as Promise<QueryResult<unknown>>,
    db
      .from('audit_log')
      .select('id, action, reason, created_at')
      .eq('target_id', input.id)
      .order('created_at', { ascending: false })
      .limit(20) as unknown as Promise<QueryResult<unknown>>,
    db
      .from('replacement_requests')
      .select('id, order_id, status, reason, created_at')
      .eq('customer_id', input.id)
      .order('created_at', { ascending: false })
      .limit(10) as unknown as Promise<QueryResult<unknown>>,
  ]);

  const orderRows = records(ordersRes);
  const productIds = [...new Set(orderRows.map((order) => text(order.product_id)).filter(Boolean))];
  const productsRes = productIds.length
    ? ((await db
        .from('products')
        .select('id, title, supplier_id, supplier_sku')
        .in('id', productIds)
        .limit(50)) as QueryResult<unknown>)
    : null;
  const productMap = new Map<string, { title: string; hasSupplier: boolean }>();
  if (productsRes) {
    for (const prod of safeRecords(productsRes)) {
      productMap.set(text(prod.id), {
        title: text(prod.title) || 'Product',
        hasSupplier: Boolean(text(prod.supplier_id) && text(prod.supplier_sku)),
      });
    }
  }

  const threadRows = safeRecords(threadsRes);
  const threadIds = threadRows.map((t) => text(t.id)).filter(Boolean);
  const messagesRes = threadIds.length
    ? ((await db
        .from('support_messages')
        .select('thread_id, body, created_at')
        .in('thread_id', threadIds)
        .order('created_at', { ascending: false })
        .limit(100)) as QueryResult<unknown>)
    : null;
  const latestPreview = new Map<string, string>();
  if (messagesRes) {
    for (const msg of safeRecords(messagesRes)) {
      const tid = text(msg.thread_id);
      if (tid && !latestPreview.has(tid)) {
        latestPreview.set(tid, text(msg.body).slice(0, 80));
      }
    }
  }

  const points = safeRecords(pointsRes).reduce((sum, entry) => {
    const val = typeof entry.delta === 'number' ? entry.delta : Number(entry.delta ?? 0);
    return Number.isFinite(val) ? sum + val : sum;
  }, 0);

  const flags: BuyerFlagItem[] = [];
  if (row.is_blocked === true) {
    flags.push({
      id: 'active-block',
      label: 'Account blocked',
      reason: formatPlainDatesInText(text(row.blocked_reason) || 'Blocked by store staff'),
      at: text(row.blocked_at) || text(row.updated_at) || text(row.created_at),
      severity: 'fault',
    });
  }
  for (const audit of safeRecords(auditsRes)) {
    const action = text(audit.action);
    if (!action.startsWith('fraud.') && action !== 'claim.failed' && !action.startsWith('customer.')) continue;
    flags.push({
      id: text(audit.id) || `${action}-${text(audit.created_at)}`,
      label: displayAuditAction(action),
      reason: formatPlainDatesInText(text(audit.reason) || 'Recorded on account'),
      at: text(audit.created_at),
      severity: flagSeverity(action),
    });
  }

  const balanceVal = minor(row.credit_balance);
  const balanceText = formatUsdt(balanceVal);

  return {
    id: text(row.id),
    kind: 'buyer',
    name: text(row.username) ? `@${text(row.username)}` : text(row.first_name) || 'Buyer',
    username: text(row.username) || null,
    firstName: text(row.first_name) || 'Buyer',
    telegramId: text(row.telegram_user_id),
    storeName,
    state: row.is_blocked === true ? 'blocked' : 'active',
    balance: balanceText,
    balanceMinor: balanceVal.toString(),
    joinedAt: text(row.created_at),
    lastSeen: text(row.updated_at) || text(row.created_at),
    blockedAt: text(row.blocked_at) || null,
    blockedReason: text(row.blocked_reason) ? formatPlainDatesInText(text(row.blocked_reason)) : null,
    wallet: {
      balance: balanceText,
      balanceMinor: balanceVal.toString(),
      points,
      topups: safeRecords(topupsRes).map((topup) => {
        const credited = minor(topup.credited_amount_minor);
        const expected = minor(topup.amount_expected_minor);
        const rawStatus = text(topup.status) || 'pending';
        return {
          id: text(topup.id),
          amount: formatUsdt(credited > 0n ? credited : expected),
          status: displayTopupStatus(rawStatus),
          rawStatus,
          at: text(topup.created_at),
        };
      }),
    },
    orders: orderRows.map((order) => {
      const id = text(order.id);
      const tracks = {
        paymentStatus: text(order.payment_status),
        fulfillmentStatus: text(order.fulfillment_status),
        deliveryStatus: text(order.delivery_status),
      };
      const display = orderDisplayStatus(tracks);
      const product = productMap.get(text(order.product_id));
      return {
        id,
        shortId: id.slice(0, 8).toUpperCase(),
        productTitle: product?.title ?? 'Digital item',
        quantity: Number(order.quantity ?? 1) || 1,
        total: formatUsdt(minor(order.quoted_retail_price)),
        status: display.label,
        tone: display.tone,
        delivered: isOrderDelivered(tracks),
        hasSupplier: input.role === 'owner' ? (product?.hasSupplier ?? false) : false,
        at: text(order.created_at),
      };
    }),
    referrals: safeRecords(referralsRes).map((person) =>
      text(person.username) ? `@${text(person.username)}` : text(person.first_name) || 'Buyer',
    ),
    threads: threadIds,
    supportThreads: threadRows.map((t) => {
      const id = text(t.id);
      const rawStatus = text(t.status) === 'closed' ? 'closed' : 'open';
      return {
        id,
        status: rawStatus,
        statusLabel: displaySupportStatus(rawStatus),
        unread: t.unread_for_owner === true,
        lastMessageAt: text(t.last_message_at),
        preview: latestPreview.get(id) ?? '',
      };
    }),
    flags,
    replacements: safeRecords(replacementsRes).map((rep) => {
      const oid = text(rep.order_id);
      return {
        id: text(rep.id),
        orderId: oid,
        shortId: oid.slice(0, 8).toUpperCase(),
        status: displayReplacementStatus(text(rep.status) || 'pending'),
        reason: formatPlainDatesInText(text(rep.reason) || 'Warranty replacement'),
        at: text(rep.created_at),
      };
    }),
  };
}
