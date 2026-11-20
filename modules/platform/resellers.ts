/**
 * @file modules/platform/resellers.ts
 *
 * Owner-only reseller network overview, per-store metrics, and full reseller
 * detail drawer payload (store settings, bots, products, orders, buyers,
 * wallet, wholesale debt, policy override, and audit activity).
 */

import { displayAuditAction, formatPlainDatesInText } from '@/lib/display-labels';
import { AppError } from '@/lib/errors';
import { formatUsdt } from '@/lib/money';
import { orderDisplayStatus, type OrderTone } from '@/lib/order-state';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import {
  RESELLER_POLICY_FIELDS,
  readResellerPolicy,
  type ResellerPolicyKey,
} from '@/modules/platform/policy';
import { getTenantSettings } from '@/modules/tenant-settings';

export type ResellerRange = '7d' | '30d' | '90d';

export function parseResellerRange(value: string | null | undefined): ResellerRange {
  if (value === '7d' || value === '90d') return value;
  return '30d';
}

export type ResellerStoreStatus = 'active' | 'pending' | 'suspended';

export type ResellerStoreRow = {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly initials: string;
  readonly handle: string;
  readonly ownerName: string;
  readonly supportContact: string | null;
  readonly status: ResellerStoreStatus;
  readonly statusLabel: string;
  readonly joinedAt: string;
  readonly revenueMinor: string;
  readonly revenue: string;
  readonly sparkline: readonly number[];
  readonly orders: number;
  readonly buyers: number;
  readonly walletId: string | null;
  readonly walletAvailableMinor: string;
  readonly wallet: string;
  readonly owesYouMinor: string;
  readonly owesYou: string;
  readonly botId: string | null;
  readonly botUsername: string | null;
  readonly botStatus: 'Online' | 'Paused' | 'Offline' | 'Error';
  readonly botTone: 'ok' | 'warn' | 'fault' | 'neutral';
  readonly marginPercent: number;
  readonly avgOrder: string;
  readonly repeatBuyerPercent: number;
  readonly refundRatePercent: number;
};

export type PendingResellerItem = {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly ownerName: string;
  readonly initials: string;
  readonly botUsername: string | null;
  readonly supportContact: string | null;
  readonly joinedAt: string;
};

export type RevenueShareSlice = {
  readonly name: string;
  readonly value: number;
  readonly color: string;
};

export type PendingInvitationItem = {
  readonly id: string;
  readonly email: string;
  readonly expiresAt: string;
  readonly createdAt: string;
};

export type ResellersNetworkPayload = {
  readonly range: ResellerRange;
  readonly kpis: {
    readonly totalStores: number;
    readonly activeStores: number;
    readonly pendingStores: number;
    readonly suspendedStores: number;
    readonly newStoresThisMonth: number;
    readonly networkRevenue: string;
    readonly networkRevenueMinor: string;
    readonly revenueDeltaPercent: number;
    readonly wholesaleOwed: string;
    readonly owingStoresCount: number;
    readonly totalBuyers: number;
    readonly newBuyersInRange: number;
  };
  readonly pending: readonly PendingResellerItem[];
  readonly stores: readonly ResellerStoreRow[];
  readonly revenueShare: readonly RevenueShareSlice[];
  readonly invitations: readonly PendingInvitationItem[];
};

export type ResellerDetailPayload = {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly businessName: string | null;
  readonly ownerName: string;
  readonly ownerEmail: string | null;
  readonly supportContact: string | null;
  readonly status: ResellerStoreStatus;
  readonly statusLabel: string;
  readonly joinedAt: string;
  readonly storeStatus: 'open' | 'maintenance';
  readonly maintenanceMsg: string | null;
  readonly markupPercent: number;
  readonly latestReason: string | null;
  readonly wallet: {
    readonly id: string | null;
    readonly available: string;
    readonly reserved: string;
    readonly total: string;
    readonly owesYou: string;
  };
  readonly bots: readonly {
    readonly id: string;
    readonly username: string;
    readonly statusLabel: 'Online' | 'Paused' | 'Offline' | 'Error';
    readonly tone: 'ok' | 'warn' | 'fault' | 'neutral';
    readonly lastHealthAt: string | null;
  }[];
  readonly products: readonly {
    readonly id: string;
    readonly productId: string;
    readonly title: string;
    readonly retailPrice: string;
    readonly wholesalePrice: string;
    readonly visible: boolean;
  }[];
  readonly totalProducts: number;
  readonly orders: readonly {
    readonly id: string;
    readonly shortId: string;
    readonly productTitle: string;
    readonly total: string;
    readonly status: string;
    readonly tone: OrderTone;
    readonly at: string;
  }[];
  readonly totalOrders: number;
  readonly customers: readonly {
    readonly id: string;
    readonly name: string;
    readonly balance: string;
    readonly state: 'Active' | 'Blocked';
    readonly lastSeen: string;
  }[];
  readonly totalCustomers: number;
  readonly policy: {
    readonly platformPolicy: Record<string, boolean>;
    readonly override: Record<string, boolean> | null;
    readonly fields: ReadonlyArray<{ readonly key: ResellerPolicyKey; readonly label: string; readonly help: string }>;
  };
  readonly audit: readonly {
    readonly id: string;
    readonly action: string;
    readonly reason: string;
    readonly at: string;
  }[];
};

const SLICE_COLORS = ['#FF4D8D', '#5B9DFF', '#F5B042', '#3DDC97', '#9B7BFF'] as const;

function records(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error) throw new AppError('RESELLERS_READ_FAILED', result.error.message, 500);
  if (!Array.isArray(result.data)) return [];
  return result.data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

function safeRecords(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error) throw new AppError('RESELLERS_READ_FAILED', result.error.message, 500);
  if (!Array.isArray(result.data)) return [];
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

function usdtNumber(value: bigint): number {
  return Math.round((Number(value) / 1_000_000) * 100) / 100;
}

function rangeDays(range: ResellerRange): number {
  if (range === '7d') return 7;
  if (range === '90d') return 90;
  return 30;
}

function rangeStart(range: ResellerRange, now: Date): Date {
  const dt = new Date(now);
  dt.setUTCHours(0, 0, 0, 0);
  dt.setUTCDate(dt.getUTCDate() - (rangeDays(range) - 1));
  return dt;
}

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.charAt(0) ?? ''}${words[1]?.charAt(0) ?? ''}`.toUpperCase();
  }
  return name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'RS';
}

function normalizeStoreStatus(value: string): ResellerStoreStatus {
  if (value === 'active' || value === 'pending' || value === 'suspended') return value;
  return 'pending';
}

function statusLabelFor(status: ResellerStoreStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'suspended') return 'Suspended';
  return 'Pending';
}

function botStateFromRow(row: Record<string, unknown> | undefined): {
  readonly status: 'Online' | 'Paused' | 'Offline' | 'Error';
  readonly tone: 'ok' | 'warn' | 'fault' | 'neutral';
} {
  if (!row) return { status: 'Offline', tone: 'neutral' };
  const raw = text(row.status);
  if (raw === 'connected') return { status: 'Online', tone: 'ok' };
  if (raw === 'paused') return { status: 'Paused', tone: 'warn' };
  if (raw === 'error') return { status: 'Error', tone: 'fault' };
  return { status: 'Offline', tone: 'neutral' };
}

function isWholesaleOwed(row: Record<string, unknown>): boolean {
  const funding = text(row.funding_status);
  const payment = text(row.payment_status);
  return funding === 'reserved' || (payment === 'verified' && funding === 'not_applicable');
}

function overrideRecord(raw: unknown): Record<string, boolean> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, boolean> = {};
  let hasEntry = false;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'boolean') {
      out[k] = v;
      hasEntry = true;
    }
  }
  return hasEntry ? out : null;
}

export async function readResellersNetwork(
  db: DbClient,
  input: {
    readonly range?: ResellerRange;
    readonly q?: string;
    readonly status?: string;
    readonly now?: Date;
  } = {},
): Promise<ResellersNetworkPayload> {
  const range = input.range ?? '30d';
  const now = input.now ?? new Date();
  const start = rangeStart(range, now);
  const spanMs = Math.max(1, now.getTime() - start.getTime());
  const prevStart = new Date(start.getTime() - spanMs);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startIso = start.toISOString();
  const prevIso = prevStart.toISOString();
  const nowIso = now.toISOString();

  const [tenantsRes, profilesRes, walletsRes, botsRes, ordersRes, customersRes, invitesRes] = await Promise.all([
    db
      .from('tenants')
      .select('id, owner_user_id, display_name, business_name, support_contact, status, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(200) as unknown as Promise<QueryResult<unknown>>,
    db.from('profiles').select('id, display_name').eq('role', 'reseller').limit(250) as unknown as Promise<QueryResult<unknown>>,
    db.from('wallets').select('id, tenant_id, balance_total, balance_reserved').limit(250) as unknown as Promise<QueryResult<unknown>>,
    db.from('bot_connections').select('id, tenant_id, username, status, last_health_at').limit(300) as unknown as Promise<QueryResult<unknown>>,
    db
      .from('orders')
      .select('id, tenant_id, customer_id, quoted_retail_price, quoted_wholesale_price, payment_status, funding_status, created_at')
      .limit(3000) as unknown as Promise<QueryResult<unknown>>,
    db.from('customers').select('id, bot_id, created_at').limit(3000) as unknown as Promise<QueryResult<unknown>>,
    db
      .from('invitations')
      .select('id, email, expires_at, accepted_at, created_at')
      .order('created_at', { ascending: false })
      .limit(25) as unknown as Promise<QueryResult<unknown>>,
  ]);

  const tenantRows = records(tenantsRes);
  const profileNames = new Map<string, string>();
  for (const row of safeRecords(profilesRes)) {
    const id = text(row.id);
    if (id) profileNames.set(id, text(row.display_name) || 'Reseller');
  }

  const walletByTenant = new Map<string, { id: string; available: bigint }>();
  for (const row of safeRecords(walletsRes)) {
    const tid = text(row.tenant_id);
    if (!tid) continue;
    const total = minor(row.balance_total);
    const reserved = minor(row.balance_reserved);
    walletByTenant.set(tid, { id: text(row.id), available: total - reserved });
  }

  const botsByTenant = new Map<string, Record<string, unknown>[]>();
  const botToTenant = new Map<string, string>();
  for (const row of safeRecords(botsRes)) {
    const tid = text(row.tenant_id);
    const bid = text(row.id);
    if (!tid) continue;
    const list = botsByTenant.get(tid) ?? [];
    list.push(row);
    botsByTenant.set(tid, list);
    if (bid) botToTenant.set(bid, tid);
  }

  const buyersByTenant = new Map<string, number>();
  let totalBuyers = 0;
  let newBuyersInRange = 0;
  for (const row of safeRecords(customersRes)) {
    const bid = text(row.bot_id);
    const tid = bid ? botToTenant.get(bid) : undefined;
    if (!tid) continue;
    buyersByTenant.set(tid, (buyersByTenant.get(tid) ?? 0) + 1);
    totalBuyers += 1;
    const createdAt = text(row.created_at);
    if (createdAt && createdAt >= startIso) newBuyersInRange += 1;
  }

  const tenantOrdersInRange = new Map<string, Record<string, unknown>[]>();
  const tenantPaidInRange = new Map<string, Record<string, unknown>[]>();
  const tenantOwedMinor = new Map<string, bigint>();
  let networkRevenueMinor = 0n;
  let prevRevenueMinor = 0n;

  for (const order of safeRecords(ordersRes)) {
    const tid = text(order.tenant_id);
    if (!tid) continue;
    if (isWholesaleOwed(order)) {
      tenantOwedMinor.set(tid, (tenantOwedMinor.get(tid) ?? 0n) + minor(order.quoted_wholesale_price));
    }
    const createdAt = text(order.created_at);
    const paymentStatus = text(order.payment_status);
    if (createdAt && createdAt >= startIso && createdAt <= nowIso) {
      const list = tenantOrdersInRange.get(tid) ?? [];
      list.push(order);
      tenantOrdersInRange.set(tid, list);
      if (paymentStatus === 'verified') {
        const paidList = tenantPaidInRange.get(tid) ?? [];
        paidList.push(order);
        tenantPaidInRange.set(tid, paidList);
        networkRevenueMinor += minor(order.quoted_retail_price);
      }
    } else if (createdAt && createdAt >= prevIso && createdAt < startIso && paymentStatus === 'verified') {
      prevRevenueMinor += minor(order.quoted_retail_price);
    }
  }

  const bucketCount = 7;
  const bucketSpan = Math.max(1, spanMs / bucketCount);

  const allStores: ResellerStoreRow[] = tenantRows.map((row) => {
    const id = text(row.id);
    const displayName = text(row.display_name) || 'Reseller';
    const name = text(row.business_name) || displayName;
    const status = normalizeStoreStatus(text(row.status));
    const bots = botsByTenant.get(id) ?? [];
    const primaryBot = bots.find((b) => text(b.status) === 'connected') ?? bots[0];
    const botUsername = primaryBot && text(primaryBot.username) ? text(primaryBot.username) : null;
    const botState = botStateFromRow(primaryBot);
    const walletInfo = walletByTenant.get(id);
    const availableMinor = walletInfo?.available ?? 0n;
    const owedMinor = tenantOwedMinor.get(id) ?? 0n;
    const paid = tenantPaidInRange.get(id) ?? [];
    const rangeOrders = tenantOrdersInRange.get(id) ?? [];
    const revMinor = paid.reduce((sum, o) => sum + minor(o.quoted_retail_price), 0n);
    const wholesaleMinor = paid.reduce((sum, o) => sum + minor(o.quoted_wholesale_price), 0n);

    const sparkBuckets = new Array<bigint>(bucketCount).fill(0n);
    for (const o of paid) {
      const ts = new Date(text(o.created_at)).getTime();
      if (!Number.isFinite(ts)) continue;
      const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor((ts - start.getTime()) / bucketSpan)));
      sparkBuckets[idx] = (sparkBuckets[idx] ?? 0n) + minor(o.quoted_retail_price);
    }

    const buyerOrderCounts = new Map<string, number>();
    for (const o of paid) {
      const cid = text(o.customer_id);
      if (cid) buyerOrderCounts.set(cid, (buyerOrderCounts.get(cid) ?? 0) + 1);
    }
    const repeatCount = [...buyerOrderCounts.values()].filter((count) => count > 1).length;
    const repeatBuyerPercent = buyerOrderCounts.size === 0 ? 0 : Math.round((repeatCount / buyerOrderCounts.size) * 100);
    const refundedCount = rangeOrders.filter((o) => text(o.payment_status) === 'refunded').length;
    const refundRatePercent =
      rangeOrders.length === 0 ? 0 : Math.round((refundedCount / rangeOrders.length) * 1000) / 10;
    const avgMinor = paid.length === 0 ? 0n : revMinor / BigInt(paid.length);
    const marginPercent =
      revMinor === 0n ? 0 : Math.round(Number((wholesaleMinor * 1000n) / revMinor)) / 10;

    return {
      id,
      name,
      displayName,
      initials: initialsFor(name),
      handle: botUsername ? `@${botUsername}` : profileNames.get(text(row.owner_user_id)) || displayName,
      ownerName: profileNames.get(text(row.owner_user_id)) || displayName,
      supportContact: text(row.support_contact) || null,
      status,
      statusLabel: statusLabelFor(status),
      joinedAt: text(row.created_at),
      revenueMinor: revMinor.toString(),
      revenue: formatUsdt(revMinor),
      sparkline: sparkBuckets.map((v) => usdtNumber(v)),
      orders: paid.length,
      buyers: buyersByTenant.get(id) ?? 0,
      walletId: walletInfo?.id ?? null,
      walletAvailableMinor: availableMinor.toString(),
      wallet: formatUsdt(availableMinor),
      owesYouMinor: owedMinor.toString(),
      owesYou: formatUsdt(owedMinor),
      botId: primaryBot ? text(primaryBot.id) || null : null,
      botUsername,
      botStatus: botState.status,
      botTone: botState.tone,
      marginPercent,
      avgOrder: formatUsdt(avgMinor),
      repeatBuyerPercent,
      refundRatePercent,
    };
  });

  // Sort stores by revenue descending, then buyers & name for deterministic table ordering.
  const rankedStores = [...allStores].sort((a, b) => {
    const revDiff = minor(b.revenueMinor) - minor(a.revenueMinor);
    if (revDiff !== 0n) return revDiff > 0n ? 1 : -1;
    if (b.buyers !== a.buyers) return b.buyers - a.buyers;
    return a.name.localeCompare(b.name);
  });

  const pending: PendingResellerItem[] = rankedStores
    .filter((s) => s.status === 'pending')
    .map((s) => ({
      id: s.id,
      name: s.name,
      displayName: s.displayName,
      ownerName: s.ownerName,
      initials: s.initials,
      botUsername: s.botUsername,
      supportContact: s.supportContact,
      joinedAt: s.joinedAt,
    }));

  const revenueContributors = rankedStores.filter((s) => minor(s.revenueMinor) > 0n);
  const topFour = revenueContributors.slice(0, 4);
  const rest = revenueContributors.slice(4);
  const revenueShare: RevenueShareSlice[] = topFour.map((s, index) => ({
    name: s.name,
    value: usdtNumber(minor(s.revenueMinor)),
    color: SLICE_COLORS[index] ?? '#FF4D8D',
  }));
  if (rest.length > 0) {
    const restMinor = rest.reduce((sum, s) => sum + minor(s.revenueMinor), 0n);
    revenueShare.push({
      name: `Other ${rest.length} stores`,
      value: usdtNumber(restMinor),
      color: SLICE_COLORS[4],
    });
  }

  const wholesaleOwedMinor = [...tenantOwedMinor.values()].reduce((sum, v) => sum + v, 0n);
  const owingStoresCount = [...tenantOwedMinor.values()].filter((v) => v > 0n).length;
  const revenueDeltaPercent =
    prevRevenueMinor === 0n
      ? networkRevenueMinor > 0n
        ? 100
        : 0
      : Math.round(Number(((networkRevenueMinor - prevRevenueMinor) * 100n) / prevRevenueMinor));
  const activeStores = rankedStores.filter((s) => s.status === 'active').length;
  const pendingStores = pending.length;
  const suspendedStores = rankedStores.filter((s) => s.status === 'suspended').length;
  const newStoresThisMonth = rankedStores.filter((s) => s.joinedAt && s.joinedAt >= monthStart.toISOString()).length;

  const qLower = (input.q ?? '').trim().toLowerCase();
  const statusFilter = input.status ?? 'all';
  const filteredStores = rankedStores.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (qLower) {
      const hay = `${s.name} ${s.displayName} ${s.handle} ${s.ownerName}`.toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    return true;
  });

  const invitations: PendingInvitationItem[] = safeRecords(invitesRes)
    .filter((inv) => !text(inv.accepted_at) && text(inv.expires_at) > nowIso)
    .map((inv) => ({
      id: text(inv.id),
      email: text(inv.email),
      expiresAt: text(inv.expires_at),
      createdAt: text(inv.created_at),
    }));

  return {
    range,
    kpis: {
      totalStores: rankedStores.length,
      activeStores,
      pendingStores,
      suspendedStores,
      newStoresThisMonth,
      networkRevenue: formatUsdt(networkRevenueMinor),
      networkRevenueMinor: networkRevenueMinor.toString(),
      revenueDeltaPercent,
      wholesaleOwed: formatUsdt(wholesaleOwedMinor),
      owingStoresCount,
      totalBuyers,
      newBuyersInRange,
    },
    pending,
    stores: filteredStores,
    revenueShare,
    invitations,
  };
}

export async function readResellerDetail(
  db: DbClient,
  tenantId: string,
  ownerEmail: string | null = null,
): Promise<ResellerDetailPayload | null> {
  const tenantRes = (await db
    .from('tenants')
    .select('id, owner_user_id, display_name, business_name, support_contact, status, reseller_policy_override, created_at')
    .eq('id', tenantId)
    .maybeSingle()) as QueryResult<unknown>;
  const tenantRow = tenantRes.data && typeof tenantRes.data === 'object' ? (tenantRes.data as Record<string, unknown>) : null;
  if (!tenantRow) return null;

  const ownerUserId = text(tenantRow.owner_user_id);
  const [profileRes, settings, walletRes, botsRes, listingsRes, ordersRes, policyRes, auditRes] = await Promise.all([
    ownerUserId
      ? (db.from('profiles').select('display_name').eq('id', ownerUserId).maybeSingle() as unknown as Promise<QueryResult<unknown>>)
      : Promise.resolve({ data: null, error: null } as QueryResult<unknown>),
    getTenantSettings(db, tenantId),
    db.from('wallets').select('id, balance_total, balance_reserved').eq('tenant_id', tenantId).maybeSingle() as unknown as Promise<QueryResult<unknown>>,
    db.from('bot_connections').select('id, username, status, last_health_at').eq('tenant_id', tenantId).limit(10) as unknown as Promise<QueryResult<unknown>>,
    db.from('reseller_listings').select('id, product_id, retail_price, is_visible').eq('tenant_id', tenantId).limit(200) as unknown as Promise<QueryResult<unknown>>,
    db
      .from('orders')
      .select('id, product_id, quoted_retail_price, quoted_wholesale_price, payment_status, funding_status, fulfillment_status, delivery_status, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(200) as unknown as Promise<QueryResult<unknown>>,
    readResellerPolicy(db),
    db
      .from('audit_log')
      .select('id, action, reason, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(12) as unknown as Promise<QueryResult<unknown>>,
  ]);

  const botRows = safeRecords(botsRes);
  const botIds = botRows.map((b) => text(b.id)).filter(Boolean);
  const customersRes = botIds.length
    ? ((await db
        .from('customers')
        .select('id, username, first_name, credit_balance, is_blocked, updated_at, created_at')
        .in('bot_id', botIds)
        .order('updated_at', { ascending: false })
        .limit(200)) as QueryResult<unknown>)
    : ({ data: [], error: null } as QueryResult<unknown>);

  const listingRows = safeRecords(listingsRes);
  const orderRows = safeRecords(ordersRes);
  const productIds = [
    ...new Set([
      ...listingRows.map((l) => text(l.product_id)),
      ...orderRows.slice(0, 15).map((o) => text(o.product_id)),
    ].filter(Boolean)),
  ];
  const productsRes = productIds.length
    ? ((await db.from('products').select('id, title, wholesale_price').in('id', productIds).limit(250)) as QueryResult<unknown>)
    : ({ data: [], error: null } as QueryResult<unknown>);
  const productMap = new Map<string, { title: string; wholesale: bigint }>();
  for (const prod of safeRecords(productsRes)) {
    const pid = text(prod.id);
    if (pid) {
      productMap.set(pid, {
        title: text(prod.title) || 'Product',
        wholesale: minor(prod.wholesale_price),
      });
    }
  }

  const walletRow = walletRes.data && typeof walletRes.data === 'object' ? (walletRes.data as Record<string, unknown>) : null;
  const walletTotal = minor(walletRow?.balance_total);
  const walletReserved = minor(walletRow?.balance_reserved);
  const walletAvailable = walletTotal - walletReserved;
  const owedMinor = orderRows
    .filter((o) => isWholesaleOwed(o))
    .reduce((sum, o) => sum + minor(o.quoted_wholesale_price), 0n);

  const profileRow = profileRes.data && typeof profileRes.data === 'object' ? (profileRes.data as Record<string, unknown>) : null;
  const displayName = text(tenantRow.display_name) || 'Reseller';
  const businessName = text(tenantRow.business_name) || null;
  const status = normalizeStoreStatus(text(tenantRow.status));
  const auditRows = safeRecords(auditRes);
  const latestStatusAudit = auditRows.find((a) => text(a.action).startsWith('reseller.'));
  const customerRows = safeRecords(customersRes);

  return {
    id: tenantId,
    name: businessName || displayName,
    displayName,
    businessName,
    ownerName: text(profileRow?.display_name) || displayName,
    ownerEmail,
    supportContact: settings.supportContact || text(tenantRow.support_contact) || null,
    status,
    statusLabel: statusLabelFor(status),
    joinedAt: text(tenantRow.created_at),
    storeStatus: settings.storeStatus,
    maintenanceMsg: settings.maintenanceMsg,
    markupPercent: settings.markupPercent,
    latestReason: latestStatusAudit ? formatPlainDatesInText(text(latestStatusAudit.reason)) || null : null,
    wallet: {
      id: walletRow ? text(walletRow.id) || null : null,
      available: formatUsdt(walletAvailable),
      reserved: formatUsdt(walletReserved),
      total: formatUsdt(walletTotal),
      owesYou: formatUsdt(owedMinor),
    },
    bots: botRows.map((b) => {
      const state = botStateFromRow(b);
      return {
        id: text(b.id),
        username: text(b.username) ? `@${text(b.username)}` : 'Pending bot',
        statusLabel: state.status,
        tone: state.tone,
        lastHealthAt: text(b.last_health_at) || null,
      };
    }),
    products: listingRows.slice(0, 20).map((listing) => {
      const pid = text(listing.product_id);
      const prod = productMap.get(pid);
      return {
        id: text(listing.id),
        productId: pid,
        title: prod?.title ?? 'Product',
        retailPrice: formatUsdt(minor(listing.retail_price)),
        wholesalePrice: formatUsdt(prod?.wholesale ?? 0n),
        visible: listing.is_visible !== false,
      };
    }),
    totalProducts: listingRows.length,
    orders: orderRows.slice(0, 15).map((order) => {
      const oid = text(order.id);
      const tracks = {
        paymentStatus: text(order.payment_status),
        fulfillmentStatus: text(order.fulfillment_status),
        deliveryStatus: text(order.delivery_status),
      };
      const display = orderDisplayStatus(tracks);
      const prod = productMap.get(text(order.product_id));
      return {
        id: oid,
        shortId: oid.slice(0, 8).toUpperCase(),
        productTitle: prod?.title ?? 'Digital item',
        total: formatUsdt(minor(order.quoted_retail_price)),
        status: display.label,
        tone: display.tone,
        at: text(order.created_at),
      };
    }),
    totalOrders: orderRows.length,
    customers: customerRows.slice(0, 15).map((cust) => ({
      id: text(cust.id),
      name: text(cust.username) ? `@${text(cust.username)}` : text(cust.first_name) || 'Buyer',
      balance: formatUsdt(minor(cust.credit_balance)),
      state: cust.is_blocked === true ? 'Blocked' : 'Active',
      lastSeen: text(cust.updated_at) || text(cust.created_at),
    })),
    totalCustomers: customerRows.length,
    policy: {
      platformPolicy: policyRes.policy,
      override: overrideRecord(tenantRow.reseller_policy_override),
      fields: RESELLER_POLICY_FIELDS,
    },
    audit: auditRows.slice(0, 10).map((item) => ({
      id: text(item.id),
      action: displayAuditAction(text(item.action)),
      reason: formatPlainDatesInText(text(item.reason) || 'Recorded'),
      at: text(item.created_at),
    })),
  };
}
