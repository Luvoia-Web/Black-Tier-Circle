/**
 * @file modules/platform/support.ts
 *
 * Buyer support threads. A missing 0032 table is reported, not thrown into the bot.
 */

import { Bot } from 'grammy';
import { decrypt } from '@/lib/encryption';
import { ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { consumeRateLimit } from '@/lib/rate-limiter';
import { assertCustomerAllowed } from '@/modules/platform/fraud';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { createNotification } from '@/modules/notifications';
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
  readonly status: string;
  readonly unread: boolean;
  readonly lastMessageAt: string;
  readonly preview: string;
};

function records(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error || !Array.isArray(result.data)) {
    return [];
  }
  return result.data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
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
): Promise<{ readonly needsMigration: boolean; readonly threads: readonly SupportThread[] }> {
  let query = db.from('support_threads').select('id, customer_id, status, unread_for_owner, last_message_at').order('unread_for_owner', { ascending: false }).order('last_message_at', { ascending: false }).limit(50);
  if (!owner) {
    if (!tenantId) {
      return { needsMigration: false, threads: [] };
    }
    query = query.eq('tenant_id', tenantId);
  }
  const result = (await query) as QueryResult<unknown>;
  if (missingSchema(result.error)) {
    return { needsMigration: true, threads: [] };
  }
  const threads: SupportThread[] = [];
  for (const row of records(result)) {
    const id = text(row.id);
    const latest = records((await db.from('support_messages').select('body').eq('thread_id', id).order('created_at', { ascending: false }).limit(1)) as QueryResult<unknown>);
    threads.push({
      id,
      customerId: text(row.customer_id),
      status: text(row.status),
      unread: row.unread_for_owner === true,
      lastMessageAt: text(row.last_message_at),
      preview: text(latest[0]?.body).slice(0, 80),
    });
  }
  return { needsMigration: false, threads };
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
): Promise<{ readonly needsMigration: boolean; readonly thread: SupportThread | null; readonly messages: readonly SupportMessage[] }> {
  const found = (await db.from('support_threads').select('id, tenant_id, customer_id, status, unread_for_owner, last_message_at').eq('id', threadId).maybeSingle()) as QueryResult<unknown>;
  if (missingSchema(found.error)) {
    return { needsMigration: true, thread: null, messages: [] };
  }
  const row = found.data && typeof found.data === 'object' ? (found.data as Record<string, unknown>) : null;
  if (!row) {
    return { needsMigration: false, thread: null, messages: [] };
  }
  if (!scope.owner && text(row.tenant_id) !== (scope.tenantId ?? '')) {
    return { needsMigration: false, thread: null, messages: [] };
  }
  const messages = records((await db.from('support_messages').select('id, sender, body, created_at').eq('thread_id', threadId).order('created_at', { ascending: true }).limit(100)) as QueryResult<unknown>);
  const failed = await failedIds(db, messages.map((message) => text(message.id)));
  await db.from('support_threads').update({ unread_for_owner: false }).eq('id', threadId);
  return {
    needsMigration: false,
    thread: {
      id: threadId,
      customerId: text(row.customer_id),
      status: text(row.status),
      unread: false,
      lastMessageAt: text(row.last_message_at),
      preview: '',
    },
    messages: messages.map((message) => {
      const id = text(message.id);
      const sender = text(message.sender) === 'owner' ? 'owner' : 'customer';
      return { id, sender, body: text(message.body), at: text(message.created_at), failed: failed.has(id) };
    }),
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
