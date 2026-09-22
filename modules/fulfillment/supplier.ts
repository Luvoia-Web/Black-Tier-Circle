/**
 * @file modules/fulfillment/supplier.ts
 *
 * Supplier fulfillment, Telegram content delivery, and reconciliation.
 * Talks only to the SupplierConnector factory — never a concrete supplier class.
 *
 * @module Fulfillment
 */

import { getSupplierConnector } from '@/integrations/supplier/connector';
import type { SupplierOrderResult, SupplierStatusResult } from '@/integrations/supplier/types';
import { sendSupplierDelivery } from '@/integrations/telegram/delivery';
import { decrypt } from '@/lib/encryption';
import { AppError, FulfillmentError } from '@/lib/errors';
import { FULFILLMENT_CONFIG } from '@/lib/fulfillment-config';
import { logger } from '@/lib/logger';
import { getDecryptedOwnerBotToken } from '@/modules/platform';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { SUPPLIER_CONFIG } from '@/lib/supplier-config';
import { getBotConnectionById } from '@/modules/bots';
import { mapCustomerRow } from '@/modules/bots/map';
import type { CustomerRecord, CustomerRow } from '@/modules/bots/types';
import { getProduct } from '@/modules/catalog';
import { getOrder, getOrderEvents, recordTransition, type Order } from '@/modules/orders';
import { consumeReservation, releaseReservation } from '@/modules/wallet';
import { mapDeliveryAttemptRow, mapFulfillmentAttemptRow } from './map';
import type {
  DeliveryAttempt,
  DeliveryAttemptRow,
  FulfillmentAttempt,
  FulfillmentAttemptRow,
} from './types';

const GENERIC_FULFILLMENT_ERROR = 'Fulfillment could not be completed';
const ESCALATION_NOTE_MARKER = 'owner escalation';

function enqueueOrderWebhook(
  supabase: DbClient,
  tenantId: string | null,
  event: 'order.fulfilled' | 'order.delivered' | 'order.failed',
  data: Record<string, unknown>,
): void {
  void import('@/modules/public-api/webhooks')
    .then(({ enqueueWebhook }) => {
      enqueueWebhook(supabase, tenantId, event, data);
    })
    .catch((error: unknown) => {
      logger.error('webhook enqueue failed', {
        message: error instanceof Error ? error.message : 'unknown',
      });
    });
}

function asAttemptRow(data: unknown): FulfillmentAttemptRow {
  return data as FulfillmentAttemptRow;
}

function asDeliveryRow(data: unknown): DeliveryAttemptRow {
  return data as DeliveryAttemptRow;
}

function asCustomerRow(data: unknown): CustomerRow {
  return data as CustomerRow;
}

async function listFulfillmentAttempts(supabase: DbClient, orderId: string): Promise<FulfillmentAttempt[]> {
  const result = (await supabase
    .from('fulfillment_attempts')
    .select('*')
    .eq('order_id', orderId)
    .order('started_at', { ascending: false })) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('FULFILLMENT_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((row) => mapFulfillmentAttemptRow(asAttemptRow(row)));
}

async function listDeliveryAttemptsForFulfillment(
  supabase: DbClient,
  fulfillmentId: string,
): Promise<DeliveryAttempt[]> {
  const result = (await supabase
    .from('delivery_attempts')
    .select('*')
    .eq('fulfillment_id', fulfillmentId)
    .order('attempted_at', { ascending: false })) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('DELIVERY_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((row) => mapDeliveryAttemptRow(asDeliveryRow(row)));
}

async function listAllDeliveryAttempts(supabase: DbClient, orderId: string): Promise<DeliveryAttempt[]> {
  const fulfillments = await listFulfillmentAttempts(supabase, orderId);
  const attempts: DeliveryAttempt[] = [];
  for (const fulfillment of fulfillments) {
    const rows = await listDeliveryAttemptsForFulfillment(supabase, fulfillment.id);
    attempts.push(...rows);
  }
  return attempts.sort((left, right) => right.attemptedAt.getTime() - left.attemptedAt.getTime());
}

async function patchFulfillmentAttempt(
  supabase: DbClient,
  attemptId: string,
  patch: {
    readonly status?: 'pending' | 'success' | 'failed';
    readonly artifactPath?: string | null;
    readonly error?: string | null;
    readonly completedAt?: Date | null;
    readonly fulfilledBy?: string | null;
  },
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    payload.status = patch.status;
  }
  if (patch.artifactPath !== undefined) {
    payload.artifact_path = patch.artifactPath;
  }
  if (patch.error !== undefined) {
    payload.error = patch.error;
  }
  if (patch.completedAt !== undefined) {
    payload.completed_at = patch.completedAt ? patch.completedAt.toISOString() : null;
  }
  if (patch.fulfilledBy !== undefined) {
    payload.fulfilled_by = patch.fulfilledBy;
  }
  const { error } = await supabase.from('fulfillment_attempts').update(payload).eq('id', attemptId);
  if (error) {
    throw new AppError('FULFILLMENT_UPDATE_FAILED', error.message, 500);
  }
}

async function createDeliveryAttempt(
  supabase: DbClient,
  fulfillmentId: string,
  attemptNumber: number,
): Promise<DeliveryAttempt> {
  const { data, error } = await supabase
    .from('delivery_attempts')
    .insert({
      fulfillment_id: fulfillmentId,
      attempt_number: attemptNumber,
      channel: 'telegram',
      status: 'pending',
    })
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('DELIVERY_CREATE_FAILED', error?.message ?? 'Unable to record delivery attempt', 500);
  }
  return mapDeliveryAttemptRow(asDeliveryRow(data));
}

async function completeDeliveryAttempt(
  supabase: DbClient,
  attemptId: string,
  outcome: { readonly status: 'success'; readonly result: string } | { readonly status: 'failed'; readonly error: string },
): Promise<void> {
  const { error } = await supabase
    .from('delivery_attempts')
    .update(
      outcome.status === 'success'
        ? { status: 'success', result: outcome.result, error: null }
        : { status: 'failed', error: outcome.error, result: null },
    )
    .eq('id', attemptId);
  if (error) {
    throw new AppError('DELIVERY_UPDATE_FAILED', error.message, 500);
  }
}

async function getCustomerById(supabase: DbClient, customerId: string): Promise<CustomerRecord> {
  const { data, error } = await supabase.from('customers').select('*').eq('id', customerId).maybeSingle();
  if (error) {
    throw new AppError('CUSTOMER_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null) {
    throw new FulfillmentError('CUSTOMER_NOT_FOUND', GENERIC_FULFILLMENT_ERROR, 404);
  }
  return mapCustomerRow(asCustomerRow(data));
}

async function resolveBotToken(supabase: DbClient, order: Order): Promise<string | null> {
  if (order.botId && order.botId !== 'owner') {
    try {
      const connection = await getBotConnectionById(supabase, order.botId);
      return decrypt(connection.encryptedToken);
    } catch (error: unknown) {
      logger.error('fulfillment bot token lookup failed', {
        orderId: order.id,
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
  return getDecryptedOwnerBotToken(supabase);
}

async function consumeIfReserved(supabase: DbClient, order: Order): Promise<void> {
  if (order.fundingStatus !== 'reserved') {
    return;
  }
  await consumeReservation(supabase, order.id);
  await recordTransition(supabase, order.id, 'funding', 'reserved', 'debited', {
    trigger: 'worker',
    note: 'reservation consumed after successful fulfillment',
  });
}

async function releaseIfReserved(supabase: DbClient, order: Order, reason: string): Promise<void> {
  if (order.fundingStatus !== 'reserved') {
    return;
  }
  await releaseReservation(supabase, order.id, reason);
  await recordTransition(supabase, order.id, 'funding', 'reserved', 'released', {
    trigger: 'worker',
    note: reason,
  });
}

async function ensureDeliveryQueued(supabase: DbClient, orderId: string): Promise<Order> {
  const latest = await getOrder(supabase, orderId);
  if (latest.deliveryStatus === 'not_ready') {
    await recordTransition(supabase, orderId, 'delivery', 'not_ready', 'queued', {
      trigger: 'worker',
      note: 'queued for delivery',
    });
    return getOrder(supabase, orderId);
  }
  if (latest.deliveryStatus === 'retry_pending' || latest.deliveryStatus === 'unreachable') {
    await recordTransition(supabase, orderId, 'delivery', latest.deliveryStatus, 'queued', {
      trigger: 'worker',
      note: 'requeued for delivery retry',
    });
    return getOrder(supabase, orderId);
  }
  return latest;
}

async function writeAuditLog(
  supabase: DbClient,
  entry: {
    readonly actorId: string;
    readonly action: string;
    readonly targetId: string;
    readonly reason: string;
    readonly afterVal?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_type: 'order',
    target_id: entry.targetId,
    after_val: entry.afterVal ?? null,
    reason: entry.reason,
  });
  if (error) {
    throw new AppError('AUDIT_WRITE_FAILED', error.message, 500);
  }
}

function supplierSkuForProduct(product: { sku: string; supplierSku: string | null }): string {
  // TODO(supplier-integration): products need a supplier_sku field
  // For now, use product.sku as the supplier SKU when supplier_sku is unset
  return product.supplierSku && product.supplierSku.trim().length > 0 ? product.supplierSku : product.sku;
}

/**
 * Returns the supplier order reference stored on the latest fulfillment attempt.
 */
export function supplierRefFromAttempts(attempts: readonly FulfillmentAttempt[]): string | null {
  const withRef = attempts.find((item) => item.method === 'supplier' && item.artifactPath);
  return withRef?.artifactPath ?? null;
}

/**
 * Delivers supplier content (URL or text) to the customer via Telegram.
 *
 * @param supabase - Database client
 * @param order - Order to deliver
 * @param deliveryData - URL, license key, or instructions from the supplier
 */
export async function deliverSupplierContent(
  supabase: DbClient,
  order: Order,
  deliveryData: string,
): Promise<void> {
  const product = await getProduct(supabase, order.productId);
  const fulfillments = await listFulfillmentAttempts(supabase, order.id);
  const fulfillment = fulfillments[0];
  if (fulfillment === undefined) {
    throw new FulfillmentError('FULFILLMENT_ATTEMPT_MISSING', GENERIC_FULFILLMENT_ERROR, 500);
  }

  const existingDeliveries = await listAllDeliveryAttempts(supabase, order.id);
  if (existingDeliveries.length >= FULFILLMENT_CONFIG.maxDeliveryAttempts) {
    return;
  }

  let current = await ensureDeliveryQueued(supabase, order.id);
  if (current.deliveryStatus === 'queued') {
    await recordTransition(supabase, order.id, 'delivery', 'queued', 'sending', {
      trigger: 'worker',
      note: 'sending supplier content',
    });
    current = await getOrder(supabase, order.id);
  }

  const attempt = await createDeliveryAttempt(supabase, fulfillment.id, existingDeliveries.length + 1);

  try {
    if (!order.customerId) {
      throw new Error('missing customer');
    }
    const customer = await getCustomerById(supabase, order.customerId);
    const token = await resolveBotToken(supabase, order);
    if (!token) {
      throw new Error('bot unavailable');
    }
    await sendSupplierDelivery(token, customer.telegramChatId, deliveryData, product.title);
    await completeDeliveryAttempt(supabase, attempt.id, { status: 'success', result: 'supplier content sent' });
    const latest = await getOrder(supabase, order.id);
    if (latest.deliveryStatus === 'sending') {
      await recordTransition(supabase, order.id, 'delivery', 'sending', 'sent', {
        trigger: 'worker',
        note: 'supplier content delivered',
      });
      enqueueOrderWebhook(supabase, order.tenantId, 'order.delivered', { orderId: order.id });
    }
  } catch (error: unknown) {
    logger.error('supplier content delivery failed', {
      orderId: order.id,
      message: error instanceof Error ? error.message : 'unknown',
    });
    await completeDeliveryAttempt(supabase, attempt.id, { status: 'failed', error: 'delivery failed' });
    const latest = await getOrder(supabase, order.id);
    const attemptsAfter = existingDeliveries.length + 1;
    if (latest.deliveryStatus === 'sending') {
      const next = attemptsAfter >= FULFILLMENT_CONFIG.maxDeliveryAttempts ? 'unreachable' : 'retry_pending';
      await recordTransition(supabase, order.id, 'delivery', 'sending', next, {
        trigger: 'worker',
        note: next === 'unreachable' ? 'customer unreachable' : 'delivery retry pending',
      });
    }
  }
}

async function markReadyAndDeliver(
  supabase: DbClient,
  order: Order,
  deliveryData: string,
  trigger: 'worker' | 'manual',
  note?: string,
): Promise<void> {
  const latest = await getOrder(supabase, order.id);
  await consumeIfReserved(supabase, latest);
  if (latest.fulfillmentStatus === 'supplier_pending' || latest.fulfillmentStatus === 'outcome_unknown') {
    await recordTransition(supabase, latest.id, 'fulfillment', latest.fulfillmentStatus, 'ready', {
      trigger,
      note: note ?? 'supplier completed',
    });
    enqueueOrderWebhook(supabase, latest.tenantId, 'order.fulfilled', { orderId: latest.id });
  }
  await deliverSupplierContent(supabase, await getOrder(supabase, order.id), deliveryData);
}

async function markSupplierOrderFailed(
  supabase: DbClient,
  order: Order,
  reason: string,
  trigger: 'worker' | 'manual',
): Promise<void> {
  const latest = await getOrder(supabase, order.id);
  if (latest.fulfillmentStatus === 'supplier_pending' || latest.fulfillmentStatus === 'outcome_unknown') {
    await recordTransition(supabase, latest.id, 'fulfillment', latest.fulfillmentStatus, 'failed', {
      trigger,
      note: reason,
    });
    enqueueOrderWebhook(supabase, latest.tenantId, 'order.failed', { orderId: latest.id });
  }
  await releaseIfReserved(supabase, latest, reason);
}

/**
 * Submits an order to the active supplier connector.
 *
 * INVARIANT: consumeReservation called only on 'completed'
 * INVARIANT: releaseReservation called only on 'failed' (not on 'unknown' — may still complete)
 */
export async function fulfillSupplier(
  supabase: DbClient,
  order: Order,
  fulfillmentAttempt: FulfillmentAttempt,
): Promise<void> {
  const current = await getOrder(supabase, order.id);
  if (current.fulfillmentStatus === 'queued') {
    await recordTransition(supabase, current.id, 'fulfillment', 'queued', 'supplier_pending', {
      trigger: 'worker',
      note: 'submitted to supplier',
    });
  }

  const product = await getProduct(supabase, order.productId);
  const connector = getSupplierConnector();
  let result: SupplierOrderResult;

  try {
    result = await connector.createOrder({
      internalOrderId: order.id,
      supplierProductSku: supplierSkuForProduct(product),
      quantity: 1,
      ...(order.externalOrderRef ? { customerRef: order.externalOrderRef } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'supplier request error';
    const pending = await getOrder(supabase, order.id);
    if (pending.fulfillmentStatus === 'supplier_pending') {
      await recordTransition(supabase, order.id, 'fulfillment', 'supplier_pending', 'outcome_unknown', {
        trigger: 'worker',
        note: `Supplier request error: ${message}`,
      });
    }
    await patchFulfillmentAttempt(supabase, fulfillmentAttempt.id, {
      status: 'failed',
      error: message,
      completedAt: new Date(),
    });
    return;
  }

  await patchFulfillmentAttempt(supabase, fulfillmentAttempt.id, {
    artifactPath: result.supplierOrderId,
  });

  if (result.status === 'completed' && result.deliveryData) {
    await patchFulfillmentAttempt(supabase, fulfillmentAttempt.id, {
      status: 'success',
      completedAt: result.completedAt ?? new Date(),
    });
    await markReadyAndDeliver(supabase, await getOrder(supabase, order.id), result.deliveryData, 'worker');
    return;
  }

  if (result.status === 'failed' || result.status === 'cancelled') {
    const reason = result.message ?? 'Supplier rejected order';
    await patchFulfillmentAttempt(supabase, fulfillmentAttempt.id, {
      status: 'failed',
      error: reason,
      completedAt: new Date(),
    });
    await markSupplierOrderFailed(supabase, await getOrder(supabase, order.id), reason, 'worker');
    return;
  }

  const pending = await getOrder(supabase, order.id);
  if (pending.fulfillmentStatus === 'supplier_pending') {
    await recordTransition(supabase, order.id, 'fulfillment', 'supplier_pending', 'outcome_unknown', {
      trigger: 'worker',
      note: `Supplier status: ${result.status}`,
    });
  }
}

export type SupplierReconcileCounts = {
  readonly reconciled: number;
  readonly completed: number;
  readonly failed: number;
  readonly stillUnknown: number;
  readonly escalated: number;
};

async function applyStatusResult(
  supabase: DbClient,
  order: Order,
  result: SupplierStatusResult,
): Promise<'completed' | 'failed' | 'unknown'> {
  if (result.status === 'completed' && result.deliveryData) {
    const attempts = await listFulfillmentAttempts(supabase, order.id);
    const latestAttempt = attempts[0];
    if (latestAttempt) {
      await patchFulfillmentAttempt(supabase, latestAttempt.id, {
        status: 'success',
        artifactPath: result.supplierOrderId,
        completedAt: result.completedAt ?? new Date(),
        error: null,
      });
    }
    await markReadyAndDeliver(supabase, order, result.deliveryData, 'worker', result.message ?? 'supplier completed');
    return 'completed';
  }

  if (result.status === 'failed' || result.status === 'cancelled') {
    const reason = result.message ?? 'Supplier rejected order';
    const attempts = await listFulfillmentAttempts(supabase, order.id);
    const latestAttempt = attempts[0];
    if (latestAttempt) {
      await patchFulfillmentAttempt(supabase, latestAttempt.id, {
        status: 'failed',
        error: reason,
        completedAt: new Date(),
      });
    }
    await markSupplierOrderFailed(supabase, order, reason, 'worker');
    return 'failed';
  }

  return 'unknown';
}

async function maybeEscalate(supabase: DbClient, order: Order): Promise<boolean> {
  const events = await getOrderEvents(supabase, order.id);
  if (events.some((event) => (event.note ?? '').includes(ESCALATION_NOTE_MARKER))) {
    return false;
  }
  const unknownEvent = events.find(
    (event) => event.track === 'fulfillment' && event.toStatus === 'outcome_unknown',
  );
  const since = unknownEvent?.createdAt ?? order.updatedAt;
  const ageMs = Date.now() - since.getTime();
  const limitMs = SUPPLIER_CONFIG.supplier_1.escalationHours * 60 * 60 * 1000;
  if (ageMs < limitMs) {
    return false;
  }
  const { error } = await supabase.from('order_events').insert({
    order_id: order.id,
    track: 'fulfillment',
    from_status: 'outcome_unknown',
    to_status: 'outcome_unknown',
    trigger: 'worker',
    note: `Supplier outcome still unknown after ${SUPPLIER_CONFIG.supplier_1.escalationHours}h — owner escalation`,
  });
  if (error) {
    throw new AppError('ORDER_EVENT_WRITE_FAILED', error.message, 500);
  }
  return true;
}

/**
 * Reconciles a single outcome_unknown supplier order.
 *
 * INVARIANT: Never release reservation on 'unknown' status — may still complete.
 */
export async function reconcileSupplierOrder(
  supabase: DbClient,
  orderId: string,
): Promise<'completed' | 'failed' | 'unknown'> {
  const order = await getOrder(supabase, orderId);
  if (order.fulfillmentStatus !== 'outcome_unknown') {
    throw new FulfillmentError('NOT_OUTCOME_UNKNOWN', 'Order is not awaiting supplier reconciliation');
  }
  const attempts = await listFulfillmentAttempts(supabase, order.id);
  const supplierOrderId = supplierRefFromAttempts(attempts);
  if (!supplierOrderId) {
    await maybeEscalate(supabase, order);
    return 'unknown';
  }

  const connector = getSupplierConnector();
  let result: SupplierStatusResult;
  try {
    result = await connector.getOrderStatus(supplierOrderId);
  } catch (error: unknown) {
    logger.warn('supplier reconcile status check failed', {
      orderId: order.id,
      message: error instanceof Error ? error.message : 'unknown',
    });
    const escalated = await maybeEscalate(supabase, order);
    return escalated ? 'unknown' : 'unknown';
  }

  const outcome = await applyStatusResult(supabase, order, result);
  if (outcome === 'unknown') {
    await maybeEscalate(supabase, order);
  }
  return outcome;
}

/**
 * Polls supplier status for all outcome_unknown orders.
 */
export async function reconcileUnknownSupplierOrders(supabase: DbClient): Promise<SupplierReconcileCounts> {
  const { listOrders } = await import('@/modules/orders');
  const unknown = await listOrders(supabase, { fulfillmentStatus: 'outcome_unknown', limit: 100 });
  let completed = 0;
  let failed = 0;
  let stillUnknown = 0;
  let escalated = 0;
  const beforeNotes = new Map<string, number>();
  for (const order of unknown) {
    const events = await getOrderEvents(supabase, order.id);
    beforeNotes.set(
      order.id,
      events.filter((event) => (event.note ?? '').includes(ESCALATION_NOTE_MARKER)).length,
    );
    const outcome = await reconcileSupplierOrder(supabase, order.id);
    if (outcome === 'completed') {
      completed += 1;
    } else if (outcome === 'failed') {
      failed += 1;
    } else {
      stillUnknown += 1;
      const after = await getOrderEvents(supabase, order.id);
      const afterCount = after.filter((event) => (event.note ?? '').includes(ESCALATION_NOTE_MARKER)).length;
      if (afterCount > (beforeNotes.get(order.id) ?? 0)) {
        escalated += 1;
      }
    }
  }
  return {
    reconciled: unknown.length,
    completed,
    failed,
    stillUnknown,
    escalated,
  };
}

/**
 * Owner marks a supplier order completed with delivery data obtained outside the API.
 */
export async function markSupplierManuallyCompleted(
  supabase: DbClient,
  orderId: string,
  actorId: string,
  deliveryData: string,
  note?: string,
): Promise<void> {
  const trimmed = deliveryData.trim();
  if (trimmed.length === 0) {
    throw new FulfillmentError('DELIVERY_DATA_REQUIRED', 'Delivery data is required');
  }
  const order = await getOrder(supabase, orderId);
  if (order.fulfillmentStatus !== 'outcome_unknown' && order.fulfillmentStatus !== 'supplier_pending') {
    throw new FulfillmentError('NOT_SUPPLIER_PENDING', 'This order is not waiting on supplier fulfillment');
  }
  const attempts = await listFulfillmentAttempts(supabase, orderId);
  const latestAttempt = attempts[0];
  if (latestAttempt) {
    await patchFulfillmentAttempt(supabase, latestAttempt.id, {
      status: 'success',
      fulfilledBy: actorId,
      completedAt: new Date(),
      error: null,
    });
  }
  await markReadyAndDeliver(supabase, order, trimmed, 'manual', note ?? 'owner marked supplier completed');
  await writeAuditLog(supabase, {
    actorId,
    action: 'fulfillment.supplier.manual_complete',
    targetId: orderId,
    reason: note ?? 'owner marked supplier completed',
    afterVal: { fulfillmentStatus: 'ready' },
  });
}

/**
 * Owner marks a supplier order failed and releases any reservation.
 */
export async function markSupplierManuallyFailed(
  supabase: DbClient,
  orderId: string,
  actorId: string,
  note?: string,
): Promise<void> {
  const order = await getOrder(supabase, orderId);
  if (order.fulfillmentStatus !== 'outcome_unknown' && order.fulfillmentStatus !== 'supplier_pending') {
    throw new FulfillmentError('NOT_SUPPLIER_PENDING', 'This order is not waiting on supplier fulfillment');
  }
  const reason = note ?? 'owner marked supplier failed';
  const attempts = await listFulfillmentAttempts(supabase, orderId);
  const latestAttempt = attempts[0];
  if (latestAttempt) {
    await patchFulfillmentAttempt(supabase, latestAttempt.id, {
      status: 'failed',
      fulfilledBy: actorId,
      completedAt: new Date(),
      error: reason,
    });
  }
  await markSupplierOrderFailed(supabase, order, reason, 'manual');
  await writeAuditLog(supabase, {
    actorId,
    action: 'fulfillment.supplier.manual_fail',
    targetId: orderId,
    reason,
    afterVal: { fulfillmentStatus: 'failed' },
  });
}

/**
 * Re-submits an outcome_unknown or failed supplier order to the connector.
 */
export async function resubmitSupplierOrder(
  supabase: DbClient,
  orderId: string,
  actorId: string,
): Promise<void> {
  const order = await getOrder(supabase, orderId);
  if (order.fulfillmentStatus === 'outcome_unknown') {
    await recordTransition(supabase, orderId, 'fulfillment', 'outcome_unknown', 'supplier_pending', {
      actorId,
      trigger: 'manual',
      note: 're-submitted to supplier',
    });
  } else if (order.fulfillmentStatus === 'failed') {
    await recordTransition(supabase, orderId, 'fulfillment', 'failed', 'queued', {
      actorId,
      trigger: 'manual',
      note: 're-queued for supplier',
    });
    await recordTransition(supabase, orderId, 'fulfillment', 'queued', 'supplier_pending', {
      actorId,
      trigger: 'manual',
      note: 're-submitted to supplier',
    });
  } else if (order.fulfillmentStatus !== 'supplier_pending') {
    throw new FulfillmentError('NOT_RESUBMITTABLE', 'This order cannot be re-submitted to the supplier');
  }

  const existing = await listFulfillmentAttempts(supabase, orderId);
  const attemptNumber = existing.length + 1;
  const { data, error } = await supabase
    .from('fulfillment_attempts')
    .insert({
      order_id: orderId,
      attempt_number: attemptNumber,
      method: 'supplier',
      status: 'pending',
    })
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('FULFILLMENT_CREATE_FAILED', error?.message ?? 'Unable to record fulfillment attempt', 500);
  }
  const attempt = mapFulfillmentAttemptRow(asAttemptRow(data));
  await fulfillSupplier(supabase, await getOrder(supabase, orderId), attempt);
  await writeAuditLog(supabase, {
    actorId,
    action: 'fulfillment.supplier.resubmit',
    targetId: orderId,
    reason: 'owner re-submitted to supplier',
  });
}

/**
 * Retries supplier content delivery by re-fetching status from the connector.
 */
export async function retrySupplierDelivery(supabase: DbClient, order: Order): Promise<boolean> {
  const attempts = await listFulfillmentAttempts(supabase, order.id);
  if (!attempts.some((item) => item.method === 'supplier')) {
    return false;
  }
  const supplierOrderId = supplierRefFromAttempts(attempts);
  if (!supplierOrderId) {
    return false;
  }
  const connector = getSupplierConnector();
  const result = await connector.getOrderStatus(supplierOrderId);
  if (result.status === 'completed' && result.deliveryData) {
    await deliverSupplierContent(supabase, order, result.deliveryData);
    return true;
  }
  return false;
}
