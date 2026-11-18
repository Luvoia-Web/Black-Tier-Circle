/**
 * @file modules/platform/replacements.ts
 *
 * Warranty requests. Approval re-runs the existing delivery retry.
 */

import { ValidationError } from '@/lib/errors';
import { AppError } from '@/lib/errors';
import { consumeRateLimit } from '@/lib/rate-limiter';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { retryDelivery } from '@/modules/fulfillment';
import { claimTransition } from '@/modules/orders/state-machine';

function records(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error) throw new AppError('READ_FAILED', result.error.message, 500);
  if (!Array.isArray(result.data)) return [];
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

export async function requestReplacement(db: DbClient, input: { readonly orderId: string; readonly customerId: string; readonly tenantId: string | null; readonly reason: string }): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }> {
  const reason = input.reason.replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (reason.length < 3) {
    return { ok: false, message: 'Tell the store what went wrong, in a sentence.' };
  }
  const limit = await consumeRateLimit({ key: `replace:${input.customerId}`, limit: 3, windowMs: 60 * 60 * 1000, fail: 'closed' });
  if (!limit.allowed && !limit.needsMigration) {
    return { ok: false, message: 'You have sent too many replacement requests. Try again later.' };
  }
  const order = (await db.from('orders').select('id, customer_id, delivery_status, tenant_id').eq('id', input.orderId).maybeSingle()) as QueryResult<unknown>;
  const row = order.data && typeof order.data === 'object' ? (order.data as Record<string, unknown>) : null;
  if (!row || text(row.customer_id) !== input.customerId) {
    return { ok: false, message: 'That order was not found.' };
  }
  if (text(row.delivery_status) !== 'sent') {
    return { ok: false, message: 'A replacement is only available after the order is delivered.' };
  }
  const saved = (await db.from('replacement_requests').insert({
    order_id: input.orderId,
    customer_id: input.customerId,
    tenant_id: input.tenantId,
    reason,
    status: 'pending',
  }).select('id').maybeSingle()) as QueryResult<unknown>;
  if (saved.error?.code === '23505') {
    return { ok: false, message: 'This order already has an open replacement request.' };
  }
  if (missing(saved.error)) {
    return { ok: false, message: 'Replacements need migration 0032.' };
  }
  if (saved.error) {
    return { ok: false, message: 'The request could not be saved. Try again.' };
  }
  return { ok: true };
}

export async function listReplacements(db: DbClient, tenantId: string | null, owner: boolean) {
  let query = db.from('replacement_requests').select('id, order_id, reason, status, created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(25);
  if (!owner) {
    if (!tenantId) return { needsMigration: false, rows: [] };
    query = query.eq('tenant_id', tenantId);
  }
  const result = (await query) as QueryResult<unknown>;
  if (missing(result.error)) return { needsMigration: true, rows: [] };
  return {
    needsMigration: false,
    rows: records(result).map((row) => ({
      id: text(row.id),
      orderId: text(row.order_id),
      reason: text(row.reason),
      status: text(row.status),
      at: text(row.created_at),
    })),
  };
}

export async function decideReplacement(db: DbClient, input: { readonly id: string; readonly tenantId: string | null; readonly owner: boolean; readonly decision: 'approved' | 'rejected'; readonly note: string }): Promise<void> {
  const found = (await db.from('replacement_requests').select('id, order_id, tenant_id, status').eq('id', input.id).maybeSingle()) as QueryResult<unknown>;
  if (missing(found.error)) {
    throw new ValidationError('REPLACEMENT_NEEDS_MIGRATION', 'Replacements need migration 0032.');
  }
  const row = found.data && typeof found.data === 'object' ? (found.data as Record<string, unknown>) : null;
  if (!row || text(row.status) !== 'pending') {
    throw new ValidationError('REPLACEMENT_NOT_OPEN', 'That request is no longer waiting.');
  }
  if (!input.owner && text(row.tenant_id) !== (input.tenantId ?? '')) {
    throw new ValidationError('REPLACEMENT_NOT_OPEN', 'That request is not in your store.');
  }
  if (input.decision === 'rejected') {
    const saved = await db.from('replacement_requests').update({ status: 'rejected', owner_note: input.note.slice(0, 500), resolved_at: new Date().toISOString() }).eq('id', input.id).eq('status', 'pending');
    if (saved.error) {
      throw new ValidationError('REPLACEMENT_FAILED', 'The request could not be rejected.');
    }
    return;
  }
  const approved = await db.from('replacement_requests').update({ status: 'approved', owner_note: input.note.slice(0, 500) }).eq('id', input.id).eq('status', 'pending');
  if (approved.error) {
    throw new ValidationError('REPLACEMENT_FAILED', 'The request could not be approved.');
  }
  await retryDelivery(db, text(row.order_id));
  await db.from('replacement_requests').update({ status: 'replaced', resolved_at: new Date().toISOString() }).eq('id', input.id);
}

/**
 * Owner-only replacement of a delivered order.
 * One open request per order. The owner is the audit actor.
 * retryDelivery is the existing delivery path. A sent order moves to
 * retry_pending first, which is the only legal way back into that path.
 */
export async function ownerReplace(
  db: DbClient,
  input: { readonly orderId: string; readonly actorId: string; readonly reason?: string },
  retry: (database: DbClient, orderId: string) => Promise<void> = retryDelivery,
): Promise<{ readonly support: 'posted' | 'none' | 'needs-migration' }> {
  const order = (await db.from('orders').select('id, customer_id, tenant_id, delivery_status').eq('id', input.orderId).maybeSingle()) as QueryResult<unknown>;
  const row = order.data && typeof order.data === 'object' ? (order.data as Record<string, unknown>) : null;
  if (order.error || !row) {
    throw new ValidationError('REPLACEMENT_NOT_OPEN', 'That order was not found.');
  }
  if (text(row.delivery_status) !== 'sent') {
    throw new ValidationError('REPLACEMENT_NOT_DELIVERED', 'Replace is available after the order is delivered.');
  }
  const customerId = text(row.customer_id);
  if (!customerId) {
    throw new ValidationError('REPLACEMENT_NOT_OPEN', 'This order has no buyer.');
  }
  const open = (await db.from('replacement_requests').select('id').eq('order_id', input.orderId).in('status', ['pending', 'approved']).limit(1)) as QueryResult<unknown>;
  if (missing(open.error)) {
    throw new ValidationError('REPLACEMENT_NEEDS_MIGRATION', 'Replacements need migration 0032.');
  }
  if (open.error) {
    throw new ValidationError('REPLACEMENT_FAILED', open.error.message);
  }
  if (Array.isArray(open.data) && open.data.length > 0) {
    throw new ValidationError('REPLACEMENT_OPEN', 'This order already has an open replacement.');
  }
  const reason = (input.reason ?? 'Owner replacement').replace(/\s+/g, ' ').trim().slice(0, 1000) || 'Owner replacement';
  const inserted = (await db.from('replacement_requests').insert({
    order_id: input.orderId,
    customer_id: customerId,
    tenant_id: text(row.tenant_id) || null,
    reason,
    status: 'approved',
    owner_note: `actor:${input.actorId}`.slice(0, 500),
  }).select('id').maybeSingle()) as QueryResult<unknown>;
  if (inserted.error?.code === '23505') {
    throw new ValidationError('REPLACEMENT_OPEN', 'This order already has an open replacement.');
  }
  if (missing(inserted.error)) {
    throw new ValidationError('REPLACEMENT_NEEDS_MIGRATION', 'Replacements need migration 0032.');
  }
  const id = inserted.data && typeof inserted.data === 'object' ? text((inserted.data as Record<string, unknown>).id) : '';
  if (inserted.error || !id) {
    throw new ValidationError('REPLACEMENT_FAILED', 'The replacement could not be saved.');
  }
  try {
    const moved = await claimTransition(db, input.orderId, 'delivery', 'sent', 'retry_pending', {
      actorId: input.actorId,
      trigger: 'manual',
      note: 'Owner replacement',
    });
    if (!moved) {
      throw new ValidationError('REPLACEMENT_FAILED', 'The order changed before the replacement could start.');
    }
    await retry(db, input.orderId);
  } catch (error: unknown) {
    await db.from('replacement_requests').update({ status: 'rejected', owner_note: 'Replacement did not finish', resolved_at: new Date().toISOString() }).eq('id', id);
    throw error;
  }
  await db.from('replacement_requests').update({ status: 'replaced', resolved_at: new Date().toISOString() }).eq('id', id);
  await db.from('audit_log').insert({
    actor_id: input.actorId,
    action: 'order_replaced',
    target_type: 'order',
    target_id: input.orderId,
    reason,
  });
  const thread = (await db.from('support_threads').select('id').eq('customer_id', customerId).eq('status', 'open').order('last_message_at', { ascending: false }).limit(1)) as QueryResult<unknown>;
  if (missing(thread.error)) return { support: 'needs-migration' };
  const threadRow = Array.isArray(thread.data) ? thread.data[0] : null;
  const threadId = threadRow && typeof threadRow === 'object' ? text((threadRow as Record<string, unknown>).id) : '';
  if (!threadId) return { support: 'none' };
  const posted = (await db.from('support_messages').insert({
    thread_id: threadId,
    sender: 'owner',
    body: `Replacement started for order ${input.orderId.slice(0, 8)}. ${reason}`.slice(0, 2000),
  }).select('id').maybeSingle()) as QueryResult<unknown>;
  if (missing(posted.error)) return { support: 'needs-migration' };
  return { support: 'posted' };
}
