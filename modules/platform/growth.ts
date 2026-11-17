/**
 * @file modules/platform/growth.ts
 *
 * Discount codes, announcements, and buyer broadcasts.
 */

import { Bot } from 'grammy';
import { decrypt } from '@/lib/encryption';
import { ValidationError } from '@/lib/errors';
import { consumeRateLimit } from '@/lib/rate-limiter';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { getDecryptedOwnerBotToken } from '@/modules/platform/index';
import { readStudio, writeStudio } from '@/modules/store-config/access';
import { sanitizeBotHtml } from '@/modules/store-config/sanitize';
import type { StoreEvents } from '@/modules/store-config/types';

function records(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error || !Array.isArray(result.data)) return [];
  return result.data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function missing(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = error.message.toLowerCase();
  return error.code === '42P01' || error.code === '42703' || message.includes('does not exist') || message.includes('schema cache');
}

export async function listDiscountCodes(db: DbClient, tenantId: string | null) {
  let query = db.from('discount_codes').select('id, code, kind, value, min_order_minor, max_uses, used_count, per_customer_limit, expires_at, active').order('created_at', { ascending: false }).limit(50);
  query = tenantId ? query.eq('tenant_id', tenantId) : query.is('tenant_id', null);
  const result = (await query) as QueryResult<unknown>;
  if (missing(result.error)) {
    return { needsMigration: true, codes: [] };
  }
  return {
    needsMigration: false,
    codes: records(result).map((row) => ({
      id: text(row.id),
      code: text(row.code),
      kind: text(row.kind),
      value: text(row.value) || String(row.value ?? ''),
      minOrderMinor: text(row.min_order_minor) || String(row.min_order_minor ?? '0'),
      maxUses: typeof row.max_uses === 'number' ? row.max_uses : null,
      usedCount: typeof row.used_count === 'number' ? row.used_count : 0,
      perCustomerLimit: typeof row.per_customer_limit === 'number' ? row.per_customer_limit : null,
      expiresAt: text(row.expires_at),
      active: row.active === true,
    })),
  };
}

export async function createDiscountCode(db: DbClient, tenantId: string | null, input: { readonly code: string; readonly kind: 'percent' | 'fixed'; readonly value: string; readonly minOrderMinor: string; readonly maxUses: number | null; readonly perCustomerLimit: number | null; readonly expiresAt: string }) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) {
    throw new ValidationError('DISCOUNT_CODE_INVALID', 'Use 3 to 32 letters, numbers, or dashes.');
  }
  if (!/^\d+(\.\d{1,4})?$/.test(input.value) || input.value === '0') {
    throw new ValidationError('DISCOUNT_VALUE_INVALID', 'Enter a value above zero.');
  }
  if (input.kind === 'percent' && Number(input.value) > 100) {
    throw new ValidationError('DISCOUNT_VALUE_INVALID', 'A percent code cannot be above 100.');
  }
  const saved = (await db.from('discount_codes').insert({
    tenant_id: tenantId,
    code,
    kind: input.kind,
    value: input.value,
    min_order_minor: input.minOrderMinor || '0',
    max_uses: input.maxUses,
    per_customer_limit: input.perCustomerLimit,
    expires_at: input.expiresAt || null,
    active: true,
  }).select('id').maybeSingle()) as QueryResult<unknown>;
  if (missing(saved.error)) {
    throw new ValidationError('DISCOUNT_NEEDS_MIGRATION', 'Discount codes need migration 0032.');
  }
  if (saved.error) {
    throw new ValidationError('DISCOUNT_SAVE_FAILED', saved.error.code === '23505' ? 'That code already exists.' : 'The code could not be saved.');
  }
  return { id: saved.data && typeof saved.data === 'object' ? text((saved.data as Record<string, unknown>).id) : '' };
}

export async function setDiscountActive(db: DbClient, tenantId: string | null, id: string, active: boolean): Promise<void> {
  let query = db.from('discount_codes').update({ active }).eq('id', id);
  query = tenantId ? query.eq('tenant_id', tenantId) : query.is('tenant_id', null);
  const saved = await query;
  if (missing(saved.error)) {
    throw new ValidationError('DISCOUNT_NEEDS_MIGRATION', 'Discount codes need migration 0032.');
  }
  if (saved.error) {
    throw new ValidationError('DISCOUNT_SAVE_FAILED', 'The code could not be updated.');
  }
}

export async function saveEvents(db: DbClient, role: 'owner' | 'reseller', tenantId: string | null, actorId: string, events: StoreEvents): Promise<void> {
  const studio = await readStudio(db, role, tenantId);
  await writeStudio(db, role, tenantId, {
    version: studio.version,
    config: {
      ...studio.config,
      events: {
        enabled: events.enabled,
        title: sanitizeBotHtml(events.title).slice(0, 120),
        body: sanitizeBotHtml(events.body).slice(0, 2000),
        link: events.link.trim().slice(0, 300),
      },
    },
  }, actorId);
}

async function tokenFor(db: DbClient, role: 'owner' | 'reseller', tenantId: string | null): Promise<string | null> {
  if (role === 'owner') {
    return getDecryptedOwnerBotToken(db);
  }
  if (!tenantId) return null;
  const connection = (await db.from('bot_connections').select('encrypted_token').eq('tenant_id', tenantId).maybeSingle()) as QueryResult<unknown>;
  const row = connection.data && typeof connection.data === 'object' ? (connection.data as Record<string, unknown>) : null;
  const encrypted = text(row?.encrypted_token);
  if (!encrypted) return null;
  try {
    return decrypt(encrypted);
  } catch {
    return null;
  }
}

export async function broadcastBuyers(db: DbClient, input: { readonly role: 'owner' | 'reseller'; readonly tenantId: string | null; readonly botId: string | null; readonly body: string; readonly confirm: boolean }) {
  const body = input.body.trim().slice(0, 2000);
  if (!body) {
    throw new ValidationError('BROADCAST_EMPTY', 'Write a message before sending it.');
  }
  let people = db.from('customers').select('telegram_chat_id, is_blocked').limit(200);
  people = input.role === 'reseller' && input.botId ? people.eq('bot_id', input.botId) : people.is('bot_id', null);
  const rows = records((await people) as QueryResult<unknown>);
  const recipients = rows.filter((row) => row.is_blocked !== true && text(row.telegram_chat_id));
  if (!input.confirm) {
    return { confirm: true, recipients: recipients.length, sent: 0, failed: 0, skippedBlocked: rows.length - recipients.length };
  }
  const limit = await consumeRateLimit({ key: `broadcast:${input.tenantId ?? 'owner'}`, limit: 1, fail: 'closed' });
  if (!limit.allowed && !limit.needsMigration) {
    throw new ValidationError('BROADCAST_LIMIT', 'Wait a minute before sending another broadcast.');
  }
  const token = await tokenFor(db, input.role, input.tenantId);
  if (!token) {
    throw new ValidationError('BOT_NOT_CONNECTED', 'Connect the store bot before broadcasting.');
  }
  const bot = new Bot(token);
  let sent = 0;
  let failed = 0;
  for (const row of recipients) {
    try {
      await bot.api.sendMessage(text(row.telegram_chat_id), body);
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { confirm: false, recipients: recipients.length, sent, failed, skippedBlocked: rows.length - recipients.length };
}
