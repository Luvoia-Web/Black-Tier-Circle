/**
 * @file modules/platform/support.ts
 *
 * Buyer support threads, buyer context, thread open/close, and bot replies.
 */

import { Bot } from 'grammy';
import {
  displayReplacementStatus,
  displaySupportStatus,
  formatPlainDatesInText,
} from '@/lib/display-labels';
import { decrypt } from '@/lib/encryption';
import { AppError, AuthError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { formatUsdt } from '@/lib/money';
import { consumeRateLimit } from '@/lib/rate-limiter';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { createNotification } from '@/modules/notifications';
import { assertCustomerAllowed } from '@/modules/platform/fraud';
import { getDecryptedOwnerBotToken } from '@/modules/platform/index';

const BODY_MAX = 2000;
const PER_MINUTE = 6;

export type SupportMessage = {
  readonly id: string;
  readonly sender: 'customer' | 'owner';
  readonly body: string;
  readonly at: string;
  readonly failed: boolean;
};

export type SupportThread = {
  readonly id: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly storeName: string;
  readonly customerBlocked: boolean;
  readonly tenantId: string | null;
  readonly status: 'open' | 'closed';
  readonly statusLabel: string;
  readonly unread: boolean;
  readonly lastMessageAt: string;
  readonly preview: string;
};

export type SupportDeliveredOrder = {
  readonly id: string;
  readonly shortId: string;
  readonly productTitle: string;
  readonly quantity: number;
  readonly total: string;
  readonly hasSupplier: boolean;
  readonly hasOpenReplacement: boolean;
  readonly at: string;
};

export type SupportCustomerSummary = {
  readonly id: string;
  readonly name: string;
  readonly storeName: string;
  readonly balance: string;
  readonly state: string;
  readonly blockedReason: string | null;
};

export type SupportThreadDetail = {
  readonly needsMigration: boolean;
  readonly thread: SupportThread | null;
  readonly messages: readonly SupportMessage[];
  readonly customer: SupportCustomerSummary | null;
  readonly deliveredOrders: readonly SupportDeliveredOrder[];
  readonly replacements: readonly {
    readonly id: string;
    readonly orderId: string;
    readonly shortId: string;
    readonly status: string;
    readonly reason: string;
    readonly at: string;
  }[];
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

export function missingSchema(error: { message: string; code?: string } | null): boolean {
  if (!error) {
    return false;
  }
  const message = error.message.toLowerCase();
  return error.code === '42P01' || error.code === '42703' || message.includes('does not exist') || message.includes('schema cache');
}

export function clampSupportBody(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, BODY_MAX);
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function notifyStore(db: DbClient, tenantId: string | null, threadId: string, body: string): Promise<void> {
  try {
    let userId = '';
    if (tenantId) {
      const tenant = (await db.from('tenants').select('owner_user_id').eq('id', tenantId).maybeSingle()) as QueryResult<unknown>;
      const row = tenant.data && typeof tenant.data === 'object' ? (tenant.data as Record<string, unknown>) : null;
      userId = text(row?.owner_user_id);
    } else {
      const owners = records((await db.from('profiles').select('id').eq('role', 'owner').limit(1)) as QueryResult<unknown>);
      userId = text(owners[0]?.id);
    }
    if (!userId) {
      return;
    }
    await createNotification(db, {
      userId,
      tenantId,
      type: 'system',
      title: 'A buyer sent a support message',
      body: body.slice(0, 140),
      metadata: { threadId },
    });
  } catch (error: unknown) {
    logger.warn('support notification skipped', { message: error instanceof Error ? error.message : 'unknown' });
  }
}

export async function ensureSupportThread(
  db: DbClient,
  input: { readonly tenantId: string | null; readonly customerId: string; readonly botId: string | null },
): Promise<{ readonly ok: true; readonly threadId: string } | { readonly ok: false; readonly reason: 'needs-migration' }> {
  const open = (await db
    .from('support_threads')
    .select('id')
    .eq('customer_id', input.customerId)
    .eq('status', 'open')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle()) as QueryResult<unknown>;
  if (missingSchema(open.error) || open.error) {
    return { ok: false, reason: 'needs-migration' };
  }
  const existing = open.data && typeof open.data === 'object' ? text((open.data as Record<string, unknown>).id) : '';
  if (existing) {
    return { ok: true, threadId: existing };
  }
  const created = (await db
    .from('support_threads')
    .insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      bot_id: input.botId,
      status: 'open',
      unread_for_owner: false,
      last_message_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()) as QueryResult<unknown>;
  if (created.error || !created.data || typeof created.data !== 'object') {
    return { ok: false, reason: 'needs-migration' };
  }
  return { ok: true, threadId: text((created.data as Record<string, unknown>).id) };
}

export async function recordCustomerSupport(
  db: DbClient,
  input: { readonly tenantId: string | null; readonly customerId: string; readonly botId: string | null; readonly body: string },
): Promise<
  | { readonly ok: true; readonly threadId: string }
  | { readonly ok: false; readonly reason: 'needs-migration' | 'limited' | 'empty' | 'blocked' | 'fraud'; readonly message?: string }
> {
  const body = clampSupportBody(input.body);
  if (!body) {
    return { ok: false, reason: 'empty' };
  }
  try {
    await assertCustomerAllowed(db, input.customerId, 'support');
  } catch (error: unknown) {
    if (error instanceof ValidationError && error.code === 'CUSTOMER_BLOCKED') {
      return { ok: false, reason: 'blocked', message: error.message };
    }
    if (error instanceof ValidationError && error.code === 'FRAUD_LIMIT') {
      return { ok: false, reason: 'fraud', message: error.message };
    }
    throw error;
  }
  const limit = await consumeRateLimit({ key: `support:${input.customerId}`, limit: PER_MINUTE, fail: 'closed' });
  if (!limit.allowed && !limit.needsMigration) {
    return { ok: false, reason: 'limited' };
  }
  const open = (await db
    .from('support_threads')
    .select('id')
    .eq('customer_id', input.customerId)
    .eq('status', 'open')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle()) as QueryResult<unknown>;
  if (missingSchema(open.error)) {
    return { ok: false, reason: 'needs-migration' };
  }
  if (open.error) {
    logger.warn('support thread lookup failed', { message: open.error.message });
    return { ok: false, reason: 'needs-migration' };
  }
  const existing = open.data && typeof open.data === 'object' ? text((open.data as Record<string, unknown>).id) : '';
  let threadId = existing;
  if (!threadId) {
    const created = (await db
      .from('support_threads')
      .insert({
        tenant_id: input.tenantId,
        customer_id: input.customerId,
        bot_id: input.botId,
        status: 'open',
        unread_for_owner: true,
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle()) as QueryResult<unknown>;
    if (missingSchema(created.error) || created.error) {
      return { ok: false, reason: 'needs-migration' };
    }
    threadId = created.data && typeof created.data === 'object' ? text((created.data as Record<string, unknown>).id) : '';
  }
  if (!threadId) {
    return { ok: false, reason: 'needs-migration' };
  }
  const saved = (await db.from('support_messages').insert({ thread_id: threadId, sender: 'customer', body }).select('id').maybeSingle()) as QueryResult<unknown>;
  if (saved.error) {
    return { ok: false, reason: 'needs-migration' };
  }
  await db.from('support_threads').update({ unread_for_owner: true, last_message_at: new Date().toISOString(), status: 'open' }).eq('id', threadId);
  await notifyStore(db, input.tenantId, threadId, body);
  return { ok: true, threadId };
}

export async function listSupportThreads(
  db: DbClient,
  tenantId: string | null,
  owner: boolean,
  filters: { readonly status?: string; readonly q?: string } = {},
): Promise<{
  readonly needsMigration: boolean;
  readonly threads: readonly SupportThread[];
  readonly counts: { readonly all: number; readonly unread: number; readonly open: number; readonly closed: number };
}> {
  let query = db
    .from('support_threads')
    .select('id, tenant_id, customer_id, status, unread_for_owner, last_message_at')
    .order('unread_for_owner', { ascending: false })
    .order('last_message_at', { ascending: false })
    .limit(100);
  if (!owner) {
    if (!tenantId) {
      return { needsMigration: false, threads: [], counts: { all: 0, unread: 0, open: 0, closed: 0 } };
    }
    query = query.eq('tenant_id', tenantId);
  }
  const result = (await query) as QueryResult<unknown>;
  if (missingSchema(result.error)) {
    return { needsMigration: true, threads: [], counts: { all: 0, unread: 0, open: 0, closed: 0 } };
  }
  const rawThreads = records(result);
  const threadIds = rawThreads.map((row) => text(row.id)).filter(Boolean);
  const customerIds = [...new Set(rawThreads.map((row) => text(row.customer_id)).filter(Boolean))];
  const tenantIds = [...new Set(rawThreads.map((row) => text(row.tenant_id)).filter(Boolean))];

  const [customersRes, tenantsRes, messagesRes] = await Promise.all([
    customerIds.length
      ? (db.from('customers').select('id, username, first_name, is_blocked').in('id', customerIds).limit(200) as unknown as Promise<QueryResult<unknown>>)
      : Promise.resolve({ data: [], error: null } as QueryResult<unknown>),
    tenantIds.length
      ? (db.from('tenants').select('id, display_name, business_name').in('id', tenantIds).limit(200) as unknown as Promise<QueryResult<unknown>>)
      : Promise.resolve({ data: [], error: null } as QueryResult<unknown>),
    threadIds.length
      ? (db.from('support_messages').select('thread_id, body, created_at').in('thread_id', threadIds).order('created_at', { ascending: false }).limit(500) as unknown as Promise<QueryResult<unknown>>)
      : Promise.resolve({ data: [], error: null } as QueryResult<unknown>),
  ]);

  const customers = new Map<string, { name: string; blocked: boolean }>();
  for (const row of safeRecords(customersRes)) {
    const cid = text(row.id);
    if (cid) {
      customers.set(cid, {
        name: text(row.username) ? `@${text(row.username)}` : text(row.first_name) || 'Buyer',
        blocked: row.is_blocked === true,
      });
    }
  }

  const tenants = new Map<string, string>();
  for (const row of safeRecords(tenantsRes)) {
    const tid = text(row.id);
    if (tid) tenants.set(tid, text(row.business_name) || text(row.display_name) || 'Reseller store');
  }

  const latestPreview = new Map<string, string>();
  for (const row of safeRecords(messagesRes)) {
    const tid = text(row.thread_id);
    if (tid && !latestPreview.has(tid)) {
      latestPreview.set(tid, text(row.body).slice(0, 90));
    }
  }

  const allThreads: SupportThread[] = rawThreads.map((row) => {
    const id = text(row.id);
    const cid = text(row.customer_id);
    const tid = text(row.tenant_id) || null;
    const customer = customers.get(cid);
    const rawStatus = text(row.status) === 'closed' ? 'closed' : 'open';
    return {
      id,
      customerId: cid,
      customerName: customer?.name ?? 'Buyer',
      storeName: tid ? (tenants.get(tid) ?? 'Reseller store') : 'Owner store',
      customerBlocked: customer?.blocked ?? false,
      tenantId: tid,
      status: rawStatus,
      statusLabel: displaySupportStatus(rawStatus),
      unread: row.unread_for_owner === true,
      lastMessageAt: text(row.last_message_at),
      preview: latestPreview.get(id) ?? '',
    };
  });

  const counts = {
    all: allThreads.length,
    unread: allThreads.filter((item) => item.unread).length,
    open: allThreads.filter((item) => item.status === 'open').length,
    closed: allThreads.filter((item) => item.status === 'closed').length,
  };

  const statusFilter = filters.status ?? 'all';
  const qLower = (filters.q ?? '').trim().toLowerCase();
  const threads = allThreads.filter((item) => {
    if (statusFilter === 'unread' && !item.unread) return false;
    if (statusFilter === 'open' && item.status !== 'open') return false;
    if (statusFilter === 'closed' && item.status !== 'closed') return false;
    if (qLower) {
      const hay = `${item.customerName} ${item.storeName} ${item.preview}`.toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    return true;
  });

  return { needsMigration: false, threads, counts };
}

async function failedIds(db: DbClient, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }
  const result = records((await db.from('audit_log').select('target_id, action, created_at').eq('target_type', 'support_message').in('target_id', ids).order('created_at', { ascending: false }).limit(100)) as QueryResult<unknown>);
  const latest = new Map<string, string>();
  for (const row of result) {
    const id = text(row.target_id);
    if (!latest.has(id)) {
      latest.set(id, text(row.action));
    }
  }
  return new Set([...latest.entries()].filter((entry) => entry[1] === 'support_reply_failed').map((entry) => entry[0]));
}

export async function readSupportThread(
  db: DbClient,
  threadId: string,
  scope: { readonly owner: boolean; readonly tenantId: string | null },
): Promise<SupportThreadDetail> {
  const emptyDetail = (needsMigration: boolean): SupportThreadDetail => ({
    needsMigration,
    thread: null,
    messages: [],
    customer: null,
    deliveredOrders: [],
    replacements: [],
  });

  const found = (await db
    .from('support_threads')
    .select('id, tenant_id, customer_id, status, unread_for_owner, last_message_at')
    .eq('id', threadId)
    .maybeSingle()) as QueryResult<unknown>;
  if (missingSchema(found.error)) {
    return emptyDetail(true);
  }
  const row = found.data && typeof found.data === 'object' ? (found.data as Record<string, unknown>) : null;
  if (!row) {
    return emptyDetail(false);
  }
  const threadTenantId = text(row.tenant_id) || null;
  if (!scope.owner && (threadTenantId ?? '') !== (scope.tenantId ?? '')) {
    return emptyDetail(false);
  }

  const customerId = text(row.customer_id);
  let ordersQuery = db
    .from('orders')
    .select('id, product_id, quantity, quoted_retail_price, delivery_status, created_at')
    .eq('customer_id', customerId)
    .eq('delivery_status', 'sent')
    .order('created_at', { ascending: false })
    .limit(12);
  if (!scope.owner && scope.tenantId) {
    ordersQuery = ordersQuery.eq('tenant_id', scope.tenantId);
  }

  const [messagesRes, customerRes, tenantRes, deliveredRes, replacementsRes] = await Promise.all([
    db.from('support_messages').select('id, sender, body, created_at').eq('thread_id', threadId).order('created_at', { ascending: true }).limit(100) as unknown as Promise<QueryResult<unknown>>,
    db.from('customers').select('id, username, first_name, credit_balance, is_blocked, blocked_reason').eq('id', customerId).maybeSingle() as unknown as Promise<QueryResult<unknown>>,
    threadTenantId
      ? (db.from('tenants').select('id, display_name, business_name').eq('id', threadTenantId).maybeSingle() as unknown as Promise<QueryResult<unknown>>)
      : Promise.resolve({ data: null, error: null } as QueryResult<unknown>),
    ordersQuery as unknown as Promise<QueryResult<unknown>>,
    db.from('replacement_requests').select('id, order_id, status, reason, created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(12) as unknown as Promise<QueryResult<unknown>>,
  ]);

  const messages = records(messagesRes);
  const failed = await failedIds(db, messages.map((message) => text(message.id)));
  await db.from('support_threads').update({ unread_for_owner: false }).eq('id', threadId);

  const custRow = customerRes.data && typeof customerRes.data === 'object' ? (customerRes.data as Record<string, unknown>) : null;
  const custName = custRow
    ? text(custRow.username)
      ? `@${text(custRow.username)}`
      : text(custRow.first_name) || 'Buyer'
    : 'Buyer';
  const tenantRow = tenantRes.data && typeof tenantRes.data === 'object' ? (tenantRes.data as Record<string, unknown>) : null;
  const storeName = threadTenantId ? (text(tenantRow?.business_name) || text(tenantRow?.display_name) || 'Reseller store') : 'Owner store';

  const orderRows = safeRecords(deliveredRes);
  const prodIds = [...new Set(orderRows.map((item) => text(item.product_id)).filter(Boolean))];
  const prodsRes = prodIds.length
    ? ((await db.from('products').select('id, title, supplier_id, supplier_sku').in('id', prodIds).limit(50)) as QueryResult<unknown>)
    : null;
  const prodMap = new Map<string, { title: string; hasSupplier: boolean }>();
  if (prodsRes) {
    for (const prod of safeRecords(prodsRes)) {
      prodMap.set(text(prod.id), {
        title: text(prod.title) || 'Product',
        hasSupplier: Boolean(text(prod.supplier_id) && text(prod.supplier_sku)),
      });
    }
  }

  const repRows = safeRecords(replacementsRes);
  const openReplacementOrderIds = new Set(
    repRows
      .filter((r) => text(r.status) === 'pending' || text(r.status) === 'approved')
      .map((r) => text(r.order_id)),
  );

  const rawStatus = text(row.status) === 'closed' ? 'closed' : 'open';
  const latestMsg = messages[messages.length - 1];

  return {
    needsMigration: false,
    thread: {
      id: threadId,
      customerId,
      customerName: custName,
      storeName,
      customerBlocked: custRow?.is_blocked === true,
      tenantId: threadTenantId,
      status: rawStatus,
      statusLabel: displaySupportStatus(rawStatus),
      unread: false,
      lastMessageAt: text(row.last_message_at),
      preview: latestMsg ? text(latestMsg.body).slice(0, 90) : '',
    },
    messages: messages.map((message) => {
      const id = text(message.id);
      const sender = text(message.sender) === 'owner' ? 'owner' : 'customer';
      return { id, sender, body: text(message.body), at: text(message.created_at), failed: failed.has(id) };
    }),
    customer: custRow
      ? {
          id: text(custRow.id),
          name: custName,
          storeName,
          balance: formatUsdt(minor(custRow.credit_balance)),
          state: custRow.is_blocked === true ? 'blocked' : 'active',
          blockedReason: text(custRow.blocked_reason) ? formatPlainDatesInText(text(custRow.blocked_reason)) : null,
        }
      : null,
    deliveredOrders: orderRows.map((order) => {
      const id = text(order.id);
      const prod = prodMap.get(text(order.product_id));
      return {
        id,
        shortId: id.slice(0, 8).toUpperCase(),
        productTitle: prod?.title ?? 'Digital item',
        quantity: Number(order.quantity ?? 1) || 1,
        total: formatUsdt(minor(order.quoted_retail_price)),
        hasSupplier: prod?.hasSupplier ?? false,
        hasOpenReplacement: openReplacementOrderIds.has(id),
        at: text(order.created_at),
      };
    }),
    replacements: repRows.map((rep) => {
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

export async function setSupportThreadStatus(
  db: DbClient,
  input: {
    readonly threadId: string;
    readonly status: 'open' | 'closed';
    readonly scope: { readonly owner: boolean; readonly tenantId: string | null };
    readonly actorId: string;
  },
): Promise<{ readonly id: string; readonly status: 'open' | 'closed'; readonly statusLabel: string }> {
  const found = (await db.from('support_threads').select('id, tenant_id, status').eq('id', input.threadId).maybeSingle()) as QueryResult<unknown>;
  if (missingSchema(found.error)) {
    throw new ValidationError('SUPPORT_NEEDS_MIGRATION', 'Support threads require migration 0032.');
  }
  const row = found.data && typeof found.data === 'object' ? (found.data as Record<string, unknown>) : null;
  if (!row) {
    throw new NotFoundError('That support thread was not found.');
  }
  const threadTenantId = text(row.tenant_id) || null;
  if (!input.scope.owner && (threadTenantId ?? '') !== (input.scope.tenantId ?? '')) {
    throw new AuthError('FORBIDDEN', 'That thread is not in your store', 403);
  }
  const saved = await db
    .from('support_threads')
    .update({
      status: input.status,
      ...(input.status === 'closed' ? { unread_for_owner: false } : {}),
    })
    .eq('id', input.threadId);
  if (saved.error) {
    throw new AppError('SUPPORT_UPDATE_FAILED', saved.error.message, 500);
  }
  await db.from('audit_log').insert({
    actor_id: input.actorId,
    tenant_id: threadTenantId,
    action: input.status === 'closed' ? 'support.close' : 'support.reopen',
    target_type: 'support_thread',
    target_id: input.threadId,
    reason: input.status === 'closed' ? 'Thread closed from Support inbox' : 'Thread reopened from Support inbox',
  });
  return {
    id: input.threadId,
    status: input.status,
    statusLabel: displaySupportStatus(input.status),
  };
}

async function tokenForThread(db: DbClient, threadId: string): Promise<{ readonly token: string; readonly chatId: string } | null> {
  const found = (await db.from('support_threads').select('bot_id, tenant_id, customer_id').eq('id', threadId).maybeSingle()) as QueryResult<unknown>;
  const row = found.data && typeof found.data === 'object' ? (found.data as Record<string, unknown>) : null;
  if (!row) {
    return null;
  }
  const customer = (await db.from('customers').select('telegram_chat_id').eq('id', text(row.customer_id)).maybeSingle()) as QueryResult<unknown>;
  const customerRow = customer.data && typeof customer.data === 'object' ? (customer.data as Record<string, unknown>) : null;
  const chatId = text(customerRow?.telegram_chat_id);
  if (!chatId) {
    return null;
  }
  const botId = text(row.bot_id);
  if (!botId) {
    const token = await getDecryptedOwnerBotToken(db);
    return token ? { token, chatId } : null;
  }
  const connection = (await db.from('bot_connections').select('encrypted_token').eq('id', botId).maybeSingle()) as QueryResult<unknown>;
  const connectionRow = connection.data && typeof connection.data === 'object' ? (connection.data as Record<string, unknown>) : null;
  const encrypted = text(connectionRow?.encrypted_token);
  if (!encrypted) {
    return null;
  }
  try {
    return { token: decrypt(encrypted), chatId };
  } catch {
    return null;
  }
}

async function markSend(db: DbClient, messageId: string, actorId: string, ok: boolean, reason: string): Promise<void> {
  await db.from('audit_log').insert({
    actor_id: actorId,
    action: ok ? 'support_reply_sent' : 'support_reply_failed',
    target_type: 'support_message',
    target_id: messageId,
    reason,
  });
}

export async function replyToSupport(
  db: DbClient,
  input: { readonly threadId: string; readonly body: string; readonly actorId: string; readonly messageId?: string },
): Promise<{ readonly messageId: string; readonly sent: boolean }> {
  const body = clampSupportBody(input.body);
  if (!body) {
    throw new ValidationError('SUPPORT_EMPTY', 'Write a reply before sending.');
  }
  let messageId = input.messageId ?? '';
  if (!messageId) {
    const saved = (await db.from('support_messages').insert({ thread_id: input.threadId, sender: 'owner', body }).select('id').maybeSingle()) as QueryResult<unknown>;
    if (missingSchema(saved.error)) {
      throw new ValidationError('SUPPORT_NEEDS_MIGRATION', 'Support needs migration 0032 before replies can be stored.');
    }
    if (saved.error || !saved.data || typeof saved.data !== 'object') {
      throw new ValidationError('SUPPORT_SAVE_FAILED', 'The reply could not be stored. Try again.');
    }
    messageId = text((saved.data as Record<string, unknown>).id);
  }
  const target = await tokenForThread(db, input.threadId);
  if (!target) {
    await markSend(db, messageId, input.actorId, false, 'The store bot has no token or the buyer has no chat.');
    return { messageId, sent: false };
  }
  try {
    const bot = new Bot(target.token);
    await bot.api.sendMessage(target.chatId, escapeHtml(body), { parse_mode: 'HTML' });
    await markSend(db, messageId, input.actorId, true, 'Sent through the store bot.');
    await db.from('support_threads').update({ last_message_at: new Date().toISOString() }).eq('id', input.threadId);
    return { messageId, sent: true };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message.slice(0, 180) : 'Telegram rejected the reply.';
    await markSend(db, messageId, input.actorId, false, reason);
    return { messageId, sent: false };
  }
}
