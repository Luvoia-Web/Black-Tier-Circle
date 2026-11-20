/**
 * @file modules/platform/growth.ts
 *
 * Discount codes, announcements, and buyer broadcasts.
 */

import { telegramSendHtml, telegramSendPhoto } from '@/integrations/telegram/api';
import { decrypt } from '@/lib/encryption';
import { AppError, ValidationError } from '@/lib/errors';
import { formatUsdt } from '@/lib/money';
import { consumeRateLimit } from '@/lib/rate-limiter';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { getDecryptedOwnerBotToken } from '@/modules/platform/index';
import { assertResellerFieldsAllowed } from '@/modules/platform/policy';
import { readStudio, writeStudio } from '@/modules/store-config/access';
import { sanitizeBotHtml } from '@/modules/store-config/sanitize';
import { renderTemplate } from '@/modules/store-config/template';
import type { StoreEvents } from '@/modules/store-config/types';
import { isAllowedBotUrl } from '@/modules/store-config/urls';

export const BROADCAST_AUDIENCES = ['all', 'buyers', 'inactive'] as const;
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

export type DiscountCodeInput = {
  readonly code: string;
  readonly kind: 'percent' | 'fixed';
  readonly value: string;
  readonly minOrderMinor: string;
  readonly maxUses: number | null;
  readonly perCustomerLimit: number | null;
  readonly startsAt?: string;
  readonly expiresAt: string;
};

export type BroadcastJobRow = {
  readonly id: string;
  readonly body: string;
  readonly imageUrl: string;
  readonly audience: BroadcastAudience;
  readonly status: string;
  readonly scheduledFor: string;
  readonly recipients: number;
  readonly sent: number;
  readonly failed: number;
  readonly createdAt: string;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 20;
const BATCH_PAUSE_MS = 1000;

function records(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error) throw new AppError('READ_FAILED', result.error.message, 500);
  if (!Array.isArray(result.data)) return [];
  return result.data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function minor(value: unknown): bigint {
  try {
    return BigInt(typeof value === 'string' || typeof value === 'number' ? String(value).split('.')[0] ?? '0' : 0);
  } catch {
    return 0n;
  }
}

function missing(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = error.message.toLowerCase();
  return error.code === '42P01' || error.code === '42703' || message.includes('does not exist') || message.includes('schema cache');
}

function validateDiscountInput(input: DiscountCodeInput): {
  readonly code: string;
  readonly value: string;
  readonly minOrderMinor: string;
  readonly startsAt: string | null;
  readonly expiresAt: string | null;
} {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) {
    throw new ValidationError('DISCOUNT_CODE_INVALID', 'Use 3 to 32 letters, numbers, or dashes.');
  }
  if (!/^\d+$/.test(input.value) || BigInt(input.value) <= 0n) {
    throw new ValidationError('DISCOUNT_VALUE_INVALID', 'Enter a value above zero.');
  }
  if (input.kind === 'percent' && Number(input.value) > 100) {
    throw new ValidationError('DISCOUNT_VALUE_INVALID', 'A percent code cannot be above 100.');
  }
  const minMinor = input.minOrderMinor && /^\d+$/.test(input.minOrderMinor) ? input.minOrderMinor : '0';
  const startsAt = input.startsAt?.trim() ? input.startsAt.trim() : null;
  const expiresAt = input.expiresAt.trim() ? input.expiresAt.trim() : null;
  if (startsAt && Number.isNaN(Date.parse(startsAt))) {
    throw new ValidationError('DISCOUNT_WINDOW_INVALID', 'Choose a valid start date.');
  }
  if (expiresAt && Number.isNaN(Date.parse(expiresAt))) {
    throw new ValidationError('DISCOUNT_WINDOW_INVALID', 'Choose a valid expiry date.');
  }
  if (startsAt && expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) {
    throw new ValidationError('DISCOUNT_WINDOW_INVALID', 'The expiry date must be after the start date.');
  }
  return { code, value: input.value, minOrderMinor: minMinor, startsAt, expiresAt };
}

export async function listDiscountCodes(db: DbClient, tenantId: string | null) {
  let query = db
    .from('discount_codes')
    .select('id, code, kind, value, min_order_minor, max_uses, used_count, per_customer_limit, starts_at, expires_at, active, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
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
      kind: text(row.kind) === 'fixed' ? 'fixed' : 'percent',
      value: text(row.value) || String(row.value ?? ''),
      minOrderMinor: text(row.min_order_minor) || String(row.min_order_minor ?? '0'),
      maxUses: typeof row.max_uses === 'number' ? row.max_uses : null,
      usedCount: typeof row.used_count === 'number' ? row.used_count : 0,
      perCustomerLimit: typeof row.per_customer_limit === 'number' ? row.per_customer_limit : null,
      startsAt: text(row.starts_at),
      expiresAt: text(row.expires_at),
      createdAt: text(row.created_at),
      active: row.active === true,
    })),
  };
}

export async function createDiscountCode(
  db: DbClient,
  tenantId: string | null,
  input: DiscountCodeInput,
  actorId?: string,
) {
  if (tenantId) {
    await assertResellerFieldsAllowed(db, ['discounts'], tenantId);
  }
  const clean = validateDiscountInput(input);
  const saved = (await db
    .from('discount_codes')
    .insert({
      tenant_id: tenantId,
      code: clean.code,
      kind: input.kind,
      value: clean.value,
      min_order_minor: clean.minOrderMinor,
      max_uses: input.maxUses,
      per_customer_limit: input.perCustomerLimit,
      starts_at: clean.startsAt,
      expires_at: clean.expiresAt,
      active: true,
    })
    .select('id')
    .maybeSingle()) as QueryResult<unknown>;
  if (missing(saved.error)) {
    throw new ValidationError('DISCOUNT_NEEDS_MIGRATION', 'Discount codes need migration 0032.');
  }
  if (saved.error) {
    throw new ValidationError('DISCOUNT_SAVE_FAILED', saved.error.code === '23505' ? 'That code already exists.' : 'The code could not be saved.');
  }
  const id = saved.data && typeof saved.data === 'object' ? text((saved.data as Record<string, unknown>).id) : '';
  if (actorId) {
    await db.from('audit_log').insert({
      actor_id: actorId,
      tenant_id: tenantId,
      action: 'discount.create',
      target_type: 'discount_code',
      target_id: id || null,
      reason: `Created discount code ${clean.code}`,
      after_val: { code: clean.code, kind: input.kind, value: clean.value },
    });
  }
  return { id };
}

export async function updateDiscountCode(
  db: DbClient,
  tenantId: string | null,
  id: string,
  input: DiscountCodeInput,
  actorId?: string,
): Promise<void> {
  if (tenantId) {
    await assertResellerFieldsAllowed(db, ['discounts'], tenantId);
  }
  const clean = validateDiscountInput(input);
  let query = db
    .from('discount_codes')
    .update({
      code: clean.code,
      kind: input.kind,
      value: clean.value,
      min_order_minor: clean.minOrderMinor,
      max_uses: input.maxUses,
      per_customer_limit: input.perCustomerLimit,
      starts_at: clean.startsAt,
      expires_at: clean.expiresAt,
    })
    .eq('id', id);
  query = tenantId ? query.eq('tenant_id', tenantId) : query.is('tenant_id', null);
  const saved = await query;
  if (missing(saved.error)) {
    throw new ValidationError('DISCOUNT_NEEDS_MIGRATION', 'Discount codes need migration 0032.');
  }
  if (saved.error) {
    throw new ValidationError('DISCOUNT_SAVE_FAILED', saved.error.code === '23505' ? 'That code already exists.' : 'The code could not be updated.');
  }
  if (actorId) {
    await db.from('audit_log').insert({
      actor_id: actorId,
      tenant_id: tenantId,
      action: 'discount.update',
      target_type: 'discount_code',
      target_id: id,
      reason: `Updated discount code ${clean.code}`,
      after_val: { code: clean.code, kind: input.kind, value: clean.value },
    });
  }
}

export async function setDiscountActive(
  db: DbClient,
  tenantId: string | null,
  id: string,
  active: boolean,
  actorId?: string,
): Promise<void> {
  if (tenantId) {
    await assertResellerFieldsAllowed(db, ['discounts'], tenantId);
  }
  let query = db.from('discount_codes').update({ active }).eq('id', id);
  query = tenantId ? query.eq('tenant_id', tenantId) : query.is('tenant_id', null);
  const saved = await query;
  if (missing(saved.error)) {
    throw new ValidationError('DISCOUNT_NEEDS_MIGRATION', 'Discount codes need migration 0032.');
  }
  if (saved.error) {
    throw new ValidationError('DISCOUNT_SAVE_FAILED', 'The code could not be updated.');
  }
  if (actorId) {
    await db.from('audit_log').insert({
      actor_id: actorId,
      tenant_id: tenantId,
      action: active ? 'discount.enable' : 'discount.disable',
      target_type: 'discount_code',
      target_id: id,
      reason: active ? 'Turned discount code on' : 'Turned discount code off',
    });
  }
}

export async function deleteDiscountCode(
  db: DbClient,
  tenantId: string | null,
  id: string,
  actorId?: string,
): Promise<void> {
  if (tenantId) {
    await assertResellerFieldsAllowed(db, ['discounts'], tenantId);
  }
  let query = db.from('discount_codes').delete().eq('id', id);
  query = tenantId ? query.eq('tenant_id', tenantId) : query.is('tenant_id', null);
  const saved = await query;
  if (missing(saved.error)) {
    throw new ValidationError('DISCOUNT_NEEDS_MIGRATION', 'Discount codes need migration 0032.');
  }
  if (saved.error) {
    throw new ValidationError('DISCOUNT_DELETE_FAILED', 'The code could not be deleted.');
  }
  if (actorId) {
    await db.from('audit_log').insert({
      actor_id: actorId,
      tenant_id: tenantId,
      action: 'discount.delete',
      target_type: 'discount_code',
      target_id: id,
      reason: 'Deleted discount code',
    });
  }
}

export async function saveEvents(
  db: DbClient,
  role: 'owner' | 'reseller',
  tenantId: string | null,
  actorId: string,
  events: StoreEvents,
): Promise<void> {
  if (role === 'reseller' && tenantId) {
    await assertResellerFieldsAllowed(db, ['botCopy'], tenantId);
  }
  const studio = await readStudio(db, role, tenantId);
  await writeStudio(
    db,
    role,
    tenantId,
    {
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
    },
    actorId,
  );
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

type EligibleRecipient = {
  readonly id: string;
  readonly chatId: string;
  readonly name: string;
  readonly balance: string;
  readonly hasPaidOrder: boolean;
  readonly inactive: boolean;
};

async function loadAudiencePool(
  db: DbClient,
  role: 'owner' | 'reseller',
  tenantId: string | null,
  botId: string | null,
) {
  let people = db.from('customers').select('id, telegram_chat_id, first_name, username, credit_balance, is_blocked, updated_at').limit(500);
  people = role === 'reseller'
    ? (botId ? people.eq('bot_id', botId) : people.eq('bot_id', '00000000-0000-0000-0000-000000000000'))
    : people.is('bot_id', null);
  const rows = records((await people) as QueryResult<unknown>);
  let skippedBlocked = 0;
  const unblocked = rows.filter((row) => {
    if (row.is_blocked === true) {
      skippedBlocked += 1;
      return false;
    }
    return Boolean(text(row.telegram_chat_id));
  });
  let ordersQuery = db.from('orders').select('customer_id').eq('payment_status', 'verified').limit(1000);
  ordersQuery = role === 'reseller' && tenantId ? ordersQuery.eq('tenant_id', tenantId) : ordersQuery.is('tenant_id', null);
  const ordersResult = (await ordersQuery) as QueryResult<unknown>;
  const paidIds = new Set(
    Array.isArray(ordersResult.data)
      ? ordersResult.data.map((row) => (row && typeof row === 'object' ? text((row as Record<string, unknown>).customer_id) : '')).filter(Boolean)
      : [],
  );
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const pool: EligibleRecipient[] = unblocked.map((row) => {
    const id = text(row.id);
    const updated = Date.parse(text(row.updated_at));
    return {
      id,
      chatId: text(row.telegram_chat_id),
      name: text(row.first_name) || (text(row.username) ? `@${text(row.username)}` : 'there'),
      balance: formatUsdt(minor(row.credit_balance)),
      hasPaidOrder: paidIds.has(id),
      inactive: Number.isFinite(updated) ? updated < cutoff : true,
    };
  });
  return { pool, skippedBlocked };
}

function filterAudience(pool: readonly EligibleRecipient[], audience: BroadcastAudience): readonly EligibleRecipient[] {
  if (audience === 'buyers') return pool.filter((person) => person.hasPaidOrder);
  if (audience === 'inactive') return pool.filter((person) => person.inactive);
  return pool;
}

export async function readAudienceCounts(
  db: DbClient,
  role: 'owner' | 'reseller',
  tenantId: string | null,
  botId: string | null,
) {
  const { pool, skippedBlocked } = await loadAudiencePool(db, role, tenantId, botId);
  return {
    all: pool.length,
    buyers: pool.filter((person) => person.hasPaidOrder).length,
    inactive: pool.filter((person) => person.inactive).length,
    skippedBlocked,
  };
}

function linkText(link: { readonly label: string; readonly url: string }): string {
  const url = link.url.trim();
  if (!url) return '';
  const label = link.label.trim() || 'Link';
  return `${label}: ${url}`;
}

export async function readStoreNameAndLinks(
  db: DbClient,
  role: 'owner' | 'reseller',
  tenantId: string | null,
) {
  const studio = await readStudio(db, role, tenantId);
  let store = 'Black Tier Circle';
  if (role === 'reseller' && tenantId) {
    const row = (await db.from('tenants').select('business_name, display_name').eq('id', tenantId).maybeSingle()) as QueryResult<unknown>;
    if (row.data && typeof row.data === 'object') {
      const rec = row.data as Record<string, unknown>;
      store = text(rec.business_name) || text(rec.display_name) || store;
    }
  } else {
    const row = (await db.from('platform_settings').select('business_name').limit(1).maybeSingle()) as QueryResult<unknown>;
    if (row.data && typeof row.data === 'object') {
      store = text((row.data as Record<string, unknown>).business_name) || store;
    }
  }
  return {
    store,
    channel: linkText(studio.config.links.channel),
    group: linkText(studio.config.links.group),
    website: linkText(studio.config.links.website),
  };
}

async function storeLinksFor(db: DbClient, role: 'owner' | 'reseller', tenantId: string | null) {
  return readStoreNameAndLinks(db, role, tenantId);
}

function renderBroadcastText(
  template: string,
  links: { readonly store: string; readonly channel: string; readonly group: string; readonly website: string },
  recipient: { readonly name: string; readonly balance: string },
): string {
  return renderTemplate(template, {
    name: recipient.name,
    store: links.store,
    balance: recipient.balance,
    channel: links.channel,
    group: links.group,
    website: links.website,
  });
}

async function deliverToRecipients(
  token: string,
  template: string,
  imageUrl: string,
  links: { readonly store: string; readonly channel: string; readonly group: string; readonly website: string },
  recipients: readonly EligibleRecipient[],
  pauseMs: number = BATCH_PAUSE_MS,
): Promise<{ readonly sent: number; readonly failed: number }> {
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < recipients.length; index += 1) {
    const person = recipients[index]!;
    const rendered = renderBroadcastText(template, links, person);
    try {
      if (imageUrl) {
        await telegramSendPhoto(token, person.chatId, imageUrl, rendered.slice(0, 1024));
      } else {
        await telegramSendHtml(token, person.chatId, rendered);
      }
      sent += 1;
    } catch {
      failed += 1;
    }
    if (pauseMs > 0 && (index + 1) % BATCH_SIZE === 0 && index + 1 < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  }
  return { sent, failed };
}

export async function broadcastBuyers(
  db: DbClient,
  input: {
    readonly role: 'owner' | 'reseller';
    readonly tenantId: string | null;
    readonly botId: string | null;
    readonly body: string;
    readonly imageUrl?: string;
    readonly audience?: BroadcastAudience;
    readonly confirm: boolean;
    readonly actorId?: string;
    readonly batchPauseMs?: number;
  },
) {
  if (input.role === 'reseller' && input.tenantId && input.confirm) {
    await assertResellerFieldsAllowed(db, ['broadcasts'], input.tenantId);
  }
  const cleanBody = sanitizeBotHtml(input.body.trim()).slice(0, 4096);
  if (!cleanBody) {
    throw new ValidationError('BROADCAST_EMPTY', 'Write a message before sending it.');
  }
  const imageUrl = (input.imageUrl ?? '').trim();
  if (imageUrl && !isAllowedBotUrl(imageUrl)) {
    throw new ValidationError('BROADCAST_IMAGE_INVALID', 'The image must be an https:// link.');
  }
  const audience: BroadcastAudience = input.audience && BROADCAST_AUDIENCES.includes(input.audience) ? input.audience : 'all';
  const { pool, skippedBlocked } = await loadAudiencePool(db, input.role, input.tenantId, input.botId);
  const recipients = filterAudience(pool, audience);
  if (!input.confirm) {
    return { confirm: true, audience, recipients: recipients.length, sent: 0, failed: 0, skippedBlocked };
  }
  const limit = await consumeRateLimit({ key: `broadcast:${input.tenantId ?? 'owner'}`, limit: 1, fail: 'closed' });
  if (!limit.allowed && !limit.needsMigration) {
    throw new ValidationError('BROADCAST_LIMIT', 'Wait a minute before sending another broadcast.');
  }
  const token = await tokenFor(db, input.role, input.tenantId);
  if (!token) {
    throw new ValidationError('BOT_NOT_CONNECTED', 'Connect the store bot before broadcasting.');
  }
  const links = await storeLinksFor(db, input.role, input.tenantId);
  const { sent, failed } = await deliverToRecipients(
    token,
    cleanBody,
    imageUrl,
    links,
    recipients,
    input.batchPauseMs ?? BATCH_PAUSE_MS,
  );

  // Best-effort history write so "Send now" still succeeds before 0037 is applied.
  const history = await db.from('broadcasts').insert({
    tenant_id: input.tenantId,
    created_by: input.actorId ?? '00000000-0000-0000-0000-000000000000',
    body: cleanBody,
    image_url: imageUrl || null,
    audience,
    status: 'sent',
    scheduled_for: new Date().toISOString(),
    recipients: recipients.length,
    sent,
    failed,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  });
  void history;

  if (input.actorId) {
    await db.from('audit_log').insert({
      actor_id: input.actorId,
      tenant_id: input.tenantId,
      action: 'broadcast.send',
      target_type: 'broadcast',
      target_id: null,
      reason: `Sent broadcast to ${sent} of ${recipients.length} buyers`,
      after_val: { audience, recipients: recipients.length, sent, failed, skippedBlocked },
    });
  }
  return { confirm: false, audience, recipients: recipients.length, sent, failed, skippedBlocked };
}

export async function listBroadcastJobs(
  db: DbClient,
  tenantId: string | null,
): Promise<{ readonly needsMigration: boolean; readonly jobs: readonly BroadcastJobRow[] }> {
  let query = db
    .from('broadcasts')
    .select('id, body, image_url, audience, status, scheduled_for, recipients, sent, failed, created_at')
    .order('created_at', { ascending: false })
    .limit(25);
  query = tenantId ? query.eq('tenant_id', tenantId) : query.is('tenant_id', null);
  const result = (await query) as QueryResult<unknown>;
  if (missing(result.error)) {
    return { needsMigration: true, jobs: [] };
  }
  return {
    needsMigration: false,
    jobs: records(result).map((row) => ({
      id: text(row.id),
      body: text(row.body),
      imageUrl: text(row.image_url),
      audience: (BROADCAST_AUDIENCES.includes(text(row.audience) as BroadcastAudience) ? text(row.audience) : 'all') as BroadcastAudience,
      status: text(row.status) || 'scheduled',
      scheduledFor: text(row.scheduled_for),
      recipients: typeof row.recipients === 'number' ? row.recipients : 0,
      sent: typeof row.sent === 'number' ? row.sent : 0,
      failed: typeof row.failed === 'number' ? row.failed : 0,
      createdAt: text(row.created_at),
    })),
  };
}

export async function scheduleBroadcast(
  db: DbClient,
  input: {
    readonly role: 'owner' | 'reseller';
    readonly tenantId: string | null;
    readonly botId: string | null;
    readonly actorId: string;
    readonly body: string;
    readonly imageUrl?: string;
    readonly audience?: BroadcastAudience;
    readonly scheduledFor: string;
  },
) {
  if (input.role === 'reseller' && input.tenantId) {
    await assertResellerFieldsAllowed(db, ['broadcasts'], input.tenantId);
  }
  const cleanBody = sanitizeBotHtml(input.body.trim()).slice(0, 4096);
  if (!cleanBody) {
    throw new ValidationError('BROADCAST_EMPTY', 'Write a message before scheduling it.');
  }
  const imageUrl = (input.imageUrl ?? '').trim();
  if (imageUrl && !isAllowedBotUrl(imageUrl)) {
    throw new ValidationError('BROADCAST_IMAGE_INVALID', 'The image must be an https:// link.');
  }
  const whenMs = Date.parse(input.scheduledFor);
  if (Number.isNaN(whenMs) || whenMs <= Date.now() + 30_000) {
    throw new ValidationError('BROADCAST_SCHEDULE_INVALID', 'Pick a future time at least one minute from now.');
  }
  const audience: BroadcastAudience = input.audience && BROADCAST_AUDIENCES.includes(input.audience) ? input.audience : 'all';
  const counts = await readAudienceCounts(db, input.role, input.tenantId, input.botId);
  const scheduledIso = new Date(whenMs).toISOString();
  const saved = (await db
    .from('broadcasts')
    .insert({
      tenant_id: input.tenantId,
      created_by: input.actorId,
      body: cleanBody,
      image_url: imageUrl || null,
      audience,
      status: 'scheduled',
      scheduled_for: scheduledIso,
      recipients: counts[audience],
      sent: 0,
      failed: 0,
    })
    .select('id')
    .maybeSingle()) as QueryResult<unknown>;
  if (missing(saved.error)) {
    throw new ValidationError('BROADCAST_NEEDS_MIGRATION', 'Scheduled broadcasts need migration 0037.');
  }
  if (saved.error) {
    throw new ValidationError('BROADCAST_SCHEDULE_FAILED', 'The broadcast could not be scheduled.');
  }
  const id = saved.data && typeof saved.data === 'object' ? text((saved.data as Record<string, unknown>).id) : '';
  await db.from('audit_log').insert({
    actor_id: input.actorId,
    tenant_id: input.tenantId,
    action: 'broadcast.schedule',
    target_type: 'broadcast',
    target_id: id || null,
    reason: `Scheduled broadcast for ${counts[audience]} buyers`,
    after_val: { audience, scheduledFor: scheduledIso, recipients: counts[audience] },
  });
  return { id, scheduledFor: scheduledIso, recipients: counts[audience] };
}

export async function cancelScheduledBroadcast(
  db: DbClient,
  tenantId: string | null,
  id: string,
  actorId: string,
): Promise<void> {
  if (tenantId) {
    await assertResellerFieldsAllowed(db, ['broadcasts'], tenantId);
  }
  let query = db
    .from('broadcasts')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'scheduled');
  query = tenantId ? query.eq('tenant_id', tenantId) : query.is('tenant_id', null);
  const saved = await query;
  if (missing(saved.error)) {
    throw new ValidationError('BROADCAST_NEEDS_MIGRATION', 'Scheduled broadcasts need migration 0037.');
  }
  if (saved.error) {
    throw new ValidationError('BROADCAST_CANCEL_FAILED', 'The broadcast could not be canceled.');
  }
  await db.from('audit_log').insert({
    actor_id: actorId,
    tenant_id: tenantId,
    action: 'broadcast.cancel',
    target_type: 'broadcast',
    target_id: id,
    reason: 'Canceled scheduled broadcast',
  });
}

export async function processDueBroadcasts(db: DbClient, now: Date = new Date(), batchPauseMs: number = BATCH_PAUSE_MS) {
  const due = (await db
    .from('broadcasts')
    .select('id, tenant_id, body, image_url, audience, status, scheduled_for')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(10)) as QueryResult<unknown>;
  if (missing(due.error)) {
    return { needsMigration: true, processed: 0, results: [] };
  }
  const rows = records(due);
  const results = [];
  for (const row of rows) {
    const id = text(row.id);
    const tenantId = text(row.tenant_id) || null;
    const role: 'owner' | 'reseller' = tenantId ? 'reseller' : 'owner';
    const audience = (BROADCAST_AUDIENCES.includes(text(row.audience) as BroadcastAudience) ? text(row.audience) : 'all') as BroadcastAudience;
    const lock = (await db
      .from('broadcasts')
      .update({ status: 'sending', started_at: now.toISOString(), updated_at: now.toISOString() })
      .eq('id', id)
      .eq('status', 'scheduled')
      .select('id')) as QueryResult<unknown>;
    if (lock.error || (Array.isArray(lock.data) && lock.data.length === 0)) continue;

    let botId: string | null = null;
    if (tenantId) {
      const botRow = (await db.from('bot_connections').select('id').eq('tenant_id', tenantId).maybeSingle()) as QueryResult<unknown>;
      if (botRow.data && typeof botRow.data === 'object') {
        botId = text((botRow.data as Record<string, unknown>).id) || null;
      }
    }
    const token = await tokenFor(db, role, tenantId);
    if (!token) {
      await db.from('broadcasts').update({ status: 'failed', finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id);
      results.push({ id, status: 'failed', sent: 0, failed: 0 });
      continue;
    }
    const { pool } = await loadAudiencePool(db, role, tenantId, botId);
    const recipients = filterAudience(pool, audience);
    const links = await storeLinksFor(db, role, tenantId);
    const { sent, failed } = await deliverToRecipients(token, text(row.body), text(row.image_url), links, recipients, batchPauseMs);
    await db
      .from('broadcasts')
      .update({
        status: 'sent',
        recipients: recipients.length,
        sent,
        failed,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    results.push({ id, status: 'sent', sent, failed });
  }
  return { needsMigration: false, processed: results.length, results };
}
