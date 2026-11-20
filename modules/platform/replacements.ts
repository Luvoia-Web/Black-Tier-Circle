/**
 * @file modules/platform/replacements.ts
 *
 * Owner replacement of a delivered order.
 * A supplier replacement buys a new item. A manual replacement sends what the owner pastes.
 * The original delivery stays in the history. The buyer is not charged.
 */

import { AppError, ValidationError } from '@/lib/errors';
import { consumeRateLimit } from '@/lib/rate-limiter';
import { sanitizeInput } from '@/lib/sanitize';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { deliverReplacementItem } from '@/modules/fulfillment';
import { SupplierError } from '@/integrations/prodseller/client';
import { assertSupplierBalanceForReplacement, fulfillViaSupplier, orderCustomerEmail, supplierArtifact, supplierOrderIdFromArtifact } from '@/modules/supplier/place';

export type ReplacementMode = 'supplier' | 'manual';

export type ReplacementPlaceInput = {
  readonly orderId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly idempotencyKey: string;
  readonly email?: string;
};

export type ReplacementPlacement = {
  readonly content: string;
  readonly supplierOrderId: string;
  readonly costMinor: bigint;
};

export type ReplacementDeliverInput = {
  readonly orderId: string;
  readonly actorId: string;
  readonly content: string;
  readonly method: 'supplier' | 'manual';
  readonly artifactPath: string | null;
  readonly supplierCostMinor: string | null;
};

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

/**
 * Stable for one replacement number.
 * A failed attempt is rejected and does not consume the number, so the retry
 * sends the same key and the supplier does not sell a second item.
 */
export function replacementIdempotencyKey(orderId: string, replacementNumber: number): string {
  if (!Number.isInteger(replacementNumber) || replacementNumber < 1) {
    throw new ValidationError('REPLACEMENT_FAILED', 'Replacement number is missing.');
  }
  return `${orderId}:replacement:${replacementNumber}`;
}

const REPLACEMENT_TAG = '|replacement:';

export type ReplacementPlan =
  | { readonly action: 'place'; readonly number: number }
  | { readonly action: 'reuse'; readonly number: number; readonly content: string; readonly supplierOrderId: string; readonly costMinor: string }
  | { readonly action: 'block'; readonly number: number };

function replacementKeyFromAttempt(row: Record<string, unknown>): string {
  const artifact = text(row.artifact_path);
  const tagged = artifact.indexOf(REPLACEMENT_TAG);
  if (tagged !== -1) {
    return artifact.slice(tagged + REPLACEMENT_TAG.length);
  }
  if (artifact.startsWith('replacement:')) {
    return artifact.slice('replacement:'.length);
  }
  return '';
}

function replacementNumberFromKey(orderId: string, key: string): number {
  const prefix = `${orderId}:replacement:`;
  if (!key.startsWith(prefix)) return 0;
  const number = Number(key.slice(prefix.length));
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function attemptOutcome(row: Record<string, unknown>): 'bought' | 'failed' | 'unknown' {
  const status = text(row.status);
  const supplierOrderId = supplierOrderIdFromArtifact(text(row.artifact_path));
  if (status === 'failed' && !supplierOrderId) return 'failed';
  if (status === 'success' && supplierOrderId) return 'bought';
  return 'unknown';
}

type ReplacementHold = { readonly key: string; readonly content: string; readonly supplierOrderId: string; readonly costMinor: string };

function holdOf(metadata: unknown): ReplacementHold | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const hold = (metadata as Record<string, unknown>).replacement_hold;
  if (!hold || typeof hold !== 'object') return null;
  const row = hold as Record<string, unknown>;
  const key = text(row.key);
  const content = text(row.content);
  const supplierOrderId = text(row.supplierOrderId);
  if (!key || !content || !supplierOrderId) return null;
  return { key, content, supplierOrderId, costMinor: text(row.costMinor) };
}

/**
 * Decides whether a replacement may buy something.
 * A purchase that already succeeded is reused. A definitive failure with nothing
 * bought advances the number. An unknown outcome blocks another purchase.
 */
export function planReplacement(orderId: string, attempts: readonly Record<string, unknown>[], metadata: unknown): ReplacementPlan {
  const keyed = attempts
    .map((row) => ({ row, key: replacementKeyFromAttempt(row) }))
    .filter((item) => replacementNumberFromKey(orderId, item.key) > 0);
  if (keyed.some((item) => attemptOutcome(item.row) === 'unknown')) {
    return { action: 'block', number: 0 };
  }
  const hold = holdOf(metadata);
  if (hold && keyed.some((item) => item.key === hold.key && attemptOutcome(item.row) === 'bought')) {
    return { action: 'reuse', number: replacementNumberFromKey(orderId, hold.key), ...hold };
  }
  const numbers = keyed.map((item) => replacementNumberFromKey(orderId, item.key));
  const number = numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
  return { action: 'place', number };
}

export function purchaseOutcome(error: unknown): 'failed' | 'unknown' | 'not_sent' {
  const code = error instanceof AppError ? error.code : '';
  if (code === 'INSUFFICIENT_SUPPLIER_BALANCE' || code === 'SUPPLIER_BALANCE_UNREAD' || code === 'SUPPLIER_NOT_LINKED' || code === 'EMAIL_REQUIRED' || code === 'PRODUCT_NOT_FOUND' || code === 'INVALID_QUANTITY') {
    return 'not_sent';
  }
  if (code === 'SUPPLIER_ORDER_FAILED' || code === 'REPLACEMENT_EMPTY') {
    return 'failed';
  }
  const message = error instanceof Error ? error.message : '';
  if (/could not place|balance is too low|nothing else was bought/i.test(message)) {
    return 'failed';
  }
  return 'unknown';
}

function supplierOrderFromError(error: unknown): string {
  if (!(error instanceof AppError) || !error.details || typeof error.details !== 'object') return '';
  const id = (error.details as Record<string, unknown>).supplierOrderId;
  return typeof id === 'string' ? id : '';
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
  throw new ValidationError(
    'REPLACEMENT_NEEDS_ITEM',
    'Send a new item from the order. The original delivery is not sent again.',
  );
}

async function placeNewSupplierItem(db: DbClient, input: ReplacementPlaceInput): Promise<ReplacementPlacement> {
  const covered = await assertSupplierBalanceForReplacement(db, input.productId, input.quantity);
  const placed = await fulfillViaSupplier(db, input.orderId, input.productId, input.quantity, input.email, input.idempotencyKey);
  if (!placed.deliveryContent) {
    if (placed.supplierOrderId) {
      throw new AppError(
        'REPLACEMENT_OUTCOME_UNKNOWN',
        'The supplier accepted an order but did not return the item. Reconcile it before buying again.',
        400,
        { supplierOrderId: placed.supplierOrderId },
      );
    }
    throw new ValidationError('REPLACEMENT_EMPTY', 'The supplier did not return a new item. Nothing else was bought.');
  }
  const reported = placed.amountUsdt > 0 ? BigInt(Math.round(placed.amountUsdt * 1_000_000)) : covered.costMinor;
  return {
    content: placed.deliveryContent,
    supplierOrderId: placed.supplierOrderId,
    costMinor: reported > 0n ? reported : covered.costMinor,
  };
}

async function rememberAttempt(
  db: DbClient,
  orderId: string,
  artifact: string,
  status: 'pending' | 'success' | 'failed',
  existingId = '',
): Promise<string> {
  if (existingId) {
    await db.from('fulfillment_attempts').update({
      status,
      artifact_path: artifact,
      completed_at: status === 'pending' ? null : new Date().toISOString(),
      error: status === 'failed' ? 'The supplier failed before anything was bought.' : null,
    }).eq('id', existingId);
    return existingId;
  }
  const inserted = (await db.from('fulfillment_attempts').insert({
    order_id: orderId,
    method: 'supplier',
    status,
    artifact_path: artifact,
    attempt_number: 1,
  }).select('id').maybeSingle()) as QueryResult<unknown>;
  const id = inserted.data && typeof inserted.data === 'object' ? text((inserted.data as Record<string, unknown>).id) : '';
  if (!id) {
    throw new ValidationError('REPLACEMENT_FAILED', 'The replacement purchase could not be recorded.');
  }
  return id;
}

async function rememberHold(db: DbClient, orderId: string, hold: ReplacementHold | null): Promise<void> {
  const current = (await db.from('orders').select('metadata').eq('id', orderId).maybeSingle()) as QueryResult<unknown>;
  const row = current.data && typeof current.data === 'object' ? (current.data as Record<string, unknown>) : null;
  const metadata = row?.metadata && typeof row.metadata === 'object' ? { ...(row.metadata as Record<string, unknown>) } : {};
  if (hold) {
    metadata.replacement_hold = hold;
  } else {
    delete metadata.replacement_hold;
  }
  await db.from('orders').update({ metadata, updated_at: new Date().toISOString() }).eq('id', orderId);
}

/**
 * Owner-only replacement of a delivered order.
 * One open request. The row is approved, then replaced.
 * The owner is the audit actor. The buyer's open support thread gets a note.
 */
export async function ownerReplace(
  db: DbClient,
  input: {
    readonly orderId: string;
    readonly actorId: string;
    readonly mode: ReplacementMode;
    readonly content?: string;
    readonly reason?: string;
    readonly threadId?: string;
  },
  deps: {
    readonly place?: (database: DbClient, input: ReplacementPlaceInput) => Promise<ReplacementPlacement>;
    readonly deliver?: (database: DbClient, input: ReplacementDeliverInput) => Promise<void>;
  } = {},
): Promise<{ readonly support: 'posted' | 'none' | 'needs-migration'; readonly threadId: string | null }> {
  const place = deps.place ?? placeNewSupplierItem;
  const deliver = deps.deliver ?? ((database, item) => deliverReplacementItem(database, item));
  const cleanReason = (input.reason ?? '').trim();
  if (cleanReason.length < 5) {
    throw new ValidationError('REPLACEMENT_REASON_REQUIRED', 'Enter a reason of at least 5 characters before replacing.');
  }
  const order = (await db.from('orders').select('id, customer_id, tenant_id, product_id, quantity, delivery_status, metadata').eq('id', input.orderId).maybeSingle()) as QueryResult<unknown>;
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
  let explicitThreadId = '';
  if (input.threadId) {
    const threadCheck = (await db.from('support_threads').select('id, customer_id').eq('id', input.threadId).maybeSingle()) as QueryResult<unknown>;
    if (missing(threadCheck.error)) {
      throw new ValidationError('REPLACEMENT_NEEDS_MIGRATION', 'Support threads are unavailable.');
    }
    const threadRow = threadCheck.data && typeof threadCheck.data === 'object' ? (threadCheck.data as Record<string, unknown>) : null;
    if (!threadRow || text(threadRow.customer_id) !== customerId) {
      throw new ValidationError('THREAD_MISMATCH', 'That support thread does not belong to this buyer.');
    }
    explicitThreadId = text(threadRow.id);
  }
  const productId = text(row.product_id);
  const quantity = typeof row.quantity === 'number' && row.quantity > 0 ? row.quantity : 1;
  const product = (await db.from('products').select('id, supplier_id, supplier_sku').eq('id', productId).maybeSingle()) as QueryResult<unknown>;
  const productRow = product.data && typeof product.data === 'object' ? (product.data as Record<string, unknown>) : null;
  const supplierId = productRow ? text(productRow.supplier_id) : '';
  const supplierSku = productRow ? text(productRow.supplier_sku) : '';
  if (input.mode === 'supplier' && (!supplierId || !supplierSku)) {
    throw new ValidationError('REPLACEMENT_MANUAL_ONLY', 'This product has no supplier. Paste the replacement item.');
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
  const attempts = records((await db.from('fulfillment_attempts').select('id, order_id, method, status, artifact_path, error').eq('order_id', input.orderId).eq('method', 'supplier')) as QueryResult<unknown>);
  const plan = input.mode === 'supplier' ? planReplacement(input.orderId, attempts, row.metadata) : { action: 'place' as const, number: 1 };
  if (plan.action === 'block') {
    throw new ValidationError('REPLACEMENT_OUTCOME_UNKNOWN', 'An earlier replacement purchase did not finish. Reconcile it before buying again. Nothing new was bought.');
  }
  const number = plan.number;
  const idempotencyKey = replacementIdempotencyKey(input.orderId, number);
  const reason = (input.reason ?? 'Owner replacement').replace(/\s+/g, ' ').trim().slice(0, 1000) || 'Owner replacement';
  const inserted = (await db.from('replacement_requests').insert({
    order_id: input.orderId,
    customer_id: customerId,
    tenant_id: text(row.tenant_id) || null,
    reason,
    status: 'approved',
    owner_note: `actor:${input.actorId} replacement:${number}`.slice(0, 500),
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
  let supplierCostMinor: string | null = null;
  let purchaseAttemptId = '';
  let bought = plan.action === 'reuse';
  try {
    if (input.mode === 'supplier' && plan.action === 'reuse') {
      supplierCostMinor = plan.costMinor || null;
      await deliver(db, {
        orderId: input.orderId,
        actorId: input.actorId,
        content: plan.content,
        method: 'supplier',
        artifactPath: supplierArtifact(plan.supplierOrderId),
        supplierCostMinor,
      });
      await rememberHold(db, input.orderId, null);
    } else if (input.mode === 'supplier') {
      purchaseAttemptId = await rememberAttempt(db, input.orderId, `replacement:${idempotencyKey}`, 'pending');
      const email = await orderCustomerEmail(db, input.orderId);
      const placed = await place(db, {
        orderId: input.orderId,
        productId,
        quantity,
        idempotencyKey,
        ...(email ? { email } : {}),
      });
      supplierCostMinor = placed.costMinor.toString();
      bought = true;
      await rememberAttempt(db, input.orderId, `${supplierArtifact(placed.supplierOrderId)}${REPLACEMENT_TAG}${idempotencyKey}`, 'success', purchaseAttemptId);
      await rememberHold(db, input.orderId, {
        key: idempotencyKey,
        content: placed.content,
        supplierOrderId: placed.supplierOrderId,
        costMinor: supplierCostMinor,
      });
      await deliver(db, {
        orderId: input.orderId,
        actorId: input.actorId,
        content: placed.content,
        method: 'supplier',
        artifactPath: supplierArtifact(placed.supplierOrderId),
        supplierCostMinor,
      });
      await rememberHold(db, input.orderId, null);
    } else {
      const content = sanitizeInput(input.content ?? '');
      if (content.length < 1 || content.length > 3500) {
        throw new ValidationError('INVALID_DELIVERY', 'Paste the replacement item, up to 3500 characters.');
      }
      await deliver(db, {
        orderId: input.orderId,
        actorId: input.actorId,
        content,
        method: 'manual',
        artifactPath: null,
        supplierCostMinor: null,
      });
    }
  } catch (error: unknown) {
    if (!bought && purchaseAttemptId) {
      const outcome = purchaseOutcome(error);
      const seenOrder = supplierOrderFromError(error);
      if (outcome === 'not_sent') {
        await db.from('fulfillment_attempts').delete().eq('id', purchaseAttemptId);
      } else if (outcome === 'failed' && !seenOrder) {
        await rememberAttempt(db, input.orderId, `replacement:${idempotencyKey}`, 'failed', purchaseAttemptId);
      } else if (seenOrder) {
        await rememberAttempt(db, input.orderId, `${supplierArtifact(seenOrder)}${REPLACEMENT_TAG}${idempotencyKey}`, 'pending', purchaseAttemptId);
      }
    }
    await db.from('replacement_requests').update({ status: 'rejected', owner_note: `replacement:${number} did not finish`.slice(0, 500), resolved_at: new Date().toISOString() }).eq('id', id);
    if (error instanceof SupplierError && error.code === 'INSUFFICIENT_SUPPLIER_BALANCE') {
      throw new ValidationError(error.code, error.message);
    }
    if (error instanceof AppError && (error.code === 'INSUFFICIENT_SUPPLIER_BALANCE' || error.code === 'SUPPLIER_BALANCE_UNREAD')) {
      throw new ValidationError(error.code, error.message);
    }
    if (error instanceof ValidationError && error.code === 'REPLACEMENT_OUTCOME_UNKNOWN') {
      throw error;
    }
    if (!bought && purchaseOutcome(error) === 'unknown') {
      throw new ValidationError('REPLACEMENT_OUTCOME_UNKNOWN', 'The supplier did not confirm this replacement. Reconcile it before buying again. Nothing new was bought.');
    }
    throw error;
  }
  await db.from('replacement_requests').update({ status: 'replaced', resolved_at: new Date().toISOString() }).eq('id', id);
  let targetThreadId = explicitThreadId;
  let supportStatus: 'posted' | 'none' | 'needs-migration' = 'none';
  if (!targetThreadId) {
    const thread = (await db.from('support_threads').select('id').eq('customer_id', customerId).eq('status', 'open').order('last_message_at', { ascending: false }).limit(1)) as QueryResult<unknown>;
    if (missing(thread.error)) {
      supportStatus = 'needs-migration';
    } else {
      const threadRow = Array.isArray(thread.data) ? thread.data[0] : null;
      targetThreadId = threadRow && typeof threadRow === 'object' ? text((threadRow as Record<string, unknown>).id) : '';
    }
  }
  await db.from('audit_log').insert({
    actor_id: input.actorId,
    tenant_id: text(row.tenant_id) || null,
    action: 'order_replaced',
    target_type: 'order',
    target_id: input.orderId,
    reason,
    after_val: {
      mode: input.mode,
      replacementNumber: number,
      supplierCostMinor,
      threadId: targetThreadId || null,
      idempotencyKey: input.mode === 'supplier' ? idempotencyKey : null,
    },
  });
  if (supportStatus === 'needs-migration') return { support: 'needs-migration', threadId: null };
  if (!targetThreadId) return { support: 'none', threadId: null };
  const posted = (await db.from('support_messages').insert({
    thread_id: targetThreadId,
    sender: 'owner',
    body: `A replacement item was sent for order ${input.orderId.slice(0, 8)}. ${reason}`.slice(0, 2000),
  }).select('id').maybeSingle()) as QueryResult<unknown>;
  if (missing(posted.error)) return { support: 'needs-migration', threadId: targetThreadId };
  await db.from('support_threads').update({ last_message_at: new Date().toISOString() }).eq('id', targetThreadId);
  return { support: 'posted', threadId: targetThreadId };
}
