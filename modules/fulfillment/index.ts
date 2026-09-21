/**
 * @file modules/fulfillment/index.ts
 *
 * Fulfillment pipeline — processes orders after payment is verified.
 *
 * Called when: order.fulfillment_status = 'queued'
 * Result: order delivered to customer via Telegram, fulfillment_status = 'ready' or 'failed'
 *
 * Delivery types:
 * - file_reusable: generate signed URL → send file via Telegram
 * - inventory_unit: same as file but uses unique item from inventory
 * - manual: notify owner → owner marks done → bot sends confirmation
 * - supplier_api: external supplier connector
 *
 * INVARIANT: fulfillment_status only transitions forward (no backwards)
 * INVARIANT: consumeReservation() called only on successful fulfillment
 * INVARIANT: releaseReservation() called if fulfillment permanently fails
 *
 * @module Fulfillment
 */

import { sendFileDelivery, sendTextDelivery } from '@/integrations/telegram/delivery';
import {
  fulfillSupplier as fulfillSupplierOrder,
  retrySupplierDelivery,
} from './supplier';
import { FULFILLMENT_CONFIG } from '@/lib/fulfillment-config';
import { AppError, FulfillmentError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getOwnerBotToken } from '@/lib/owner-bot';
import { decrypt } from '@/lib/encryption';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { getBotConnectionById } from '@/modules/bots';
import { mapCustomerRow } from '@/modules/bots/map';
import type { CustomerRecord, CustomerRow } from '@/modules/bots/types';
import { generateDownloadUrl, getProduct, getProductWithAssets, PRODUCT_FILES_BUCKET } from '@/modules/catalog';
import type { DeliveryType } from '@/modules/catalog/types';
import { getOrder, listOrders, recordTransition, type Order } from '@/modules/orders';
import { consumeReservation, releaseReservation } from '@/modules/wallet';
import { mapDeliveryAttemptRow, mapFulfillmentAttemptRow } from './map';
import type {
  DeliveryAttempt,
  DeliveryAttemptRow,
  FulfillmentAttempt,
  FulfillmentAttemptRow,
  FulfillmentMethod,
  FulfillmentResult,
  OrderFulfillmentStatusSnapshot,
} from './types';

export type {
  DeliveryAttempt,
  FulfillmentAttempt,
  FulfillmentAttemptStatus,
  FulfillmentMethod,
  FulfillmentResult,
  OrderFulfillmentStatusSnapshot,
} from './types';
export {
  deliverSupplierContent,
  fulfillSupplier,
  markSupplierManuallyCompleted,
  markSupplierManuallyFailed,
  reconcileSupplierOrder,
  reconcileUnknownSupplierOrders,
  resubmitSupplierOrder,
  retrySupplierDelivery,
  supplierRefFromAttempts,
} from './supplier';
export type { SupplierReconcileCounts } from './supplier';

const GENERIC_FULFILLMENT_ERROR = 'Fulfillment could not be completed';

function enqueueOrderWebhook(
  supabase: DbClient,
  tenantId: string | null,
  event: 'order.fulfilled' | 'order.delivered' | 'order.failed' | 'order.cancelled',
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

/**
 * Maps a catalog delivery type to a fulfillment method.
 *
 * @param deliveryType - Product delivery type
 */
export function methodForDeliveryType(deliveryType: DeliveryType): FulfillmentMethod {
  if (deliveryType === 'manual') {
    return 'manual';
  }
  if (deliveryType === 'supplier_api') {
    return 'supplier';
  }
  return 'file';
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

async function createFulfillmentAttempt(
  supabase: DbClient,
  orderId: string,
  method: FulfillmentMethod,
): Promise<FulfillmentAttempt> {
  const existing = await listFulfillmentAttempts(supabase, orderId);
  const attemptNumber = existing.length + 1;
  const { data, error } = await supabase
    .from('fulfillment_attempts')
    .insert({
      order_id: orderId,
      attempt_number: attemptNumber,
      method,
      status: 'pending',
    })
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('FULFILLMENT_CREATE_FAILED', error?.message ?? 'Unable to record fulfillment attempt', 500);
  }
  return mapFulfillmentAttemptRow(asAttemptRow(data));
}

async function completeFulfillmentAttempt(
  supabase: DbClient,
  attemptId: string,
  patch: {
    readonly status: 'success' | 'failed';
    readonly artifactPath?: string | null;
    readonly fulfilledBy?: string | null;
    readonly error?: string | null;
  },
): Promise<void> {
  const payload: Record<string, unknown> = {
    status: patch.status,
    completed_at: new Date().toISOString(),
    error: patch.error ?? null,
  };
  if (patch.artifactPath !== undefined) {
    payload.artifact_path = patch.artifactPath;
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
      return null;
    }
  }
  return getOwnerBotToken();
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

async function markFulfillmentFailed(supabase: DbClient, order: Order, reason: string): Promise<void> {
  const latest = await getOrder(supabase, order.id);
  if (latest.fulfillmentStatus !== 'failed' && latest.fulfillmentStatus !== 'canceled') {
    await recordTransition(supabase, latest.id, 'fulfillment', latest.fulfillmentStatus, 'failed', {
      trigger: 'worker',
      note: reason,
    });
    enqueueOrderWebhook(supabase, latest.tenantId, 'order.failed', { orderId: latest.id });
  }
  await releaseIfReserved(supabase, latest, reason);
}

async function markDeliveryUnreachable(supabase: DbClient, orderId: string): Promise<void> {
  let current = await getOrder(supabase, orderId);
  if (current.deliveryStatus === 'unreachable') {
    return;
  }
  if (current.deliveryStatus === 'retry_pending') {
    await recordTransition(supabase, orderId, 'delivery', 'retry_pending', 'queued', {
      trigger: 'worker',
      note: 'max delivery attempts reached',
    });
    current = await getOrder(supabase, orderId);
  }
  if (current.deliveryStatus === 'not_ready') {
    await recordTransition(supabase, orderId, 'delivery', 'not_ready', 'queued', {
      trigger: 'worker',
      note: 'max delivery attempts reached',
    });
    current = await getOrder(supabase, orderId);
  }
  if (current.deliveryStatus === 'queued') {
    await recordTransition(supabase, orderId, 'delivery', 'queued', 'sending', {
      trigger: 'worker',
      note: 'max delivery attempts reached',
    });
    current = await getOrder(supabase, orderId);
  }
  if (current.deliveryStatus === 'sending') {
    await recordTransition(supabase, orderId, 'delivery', 'sending', 'unreachable', {
      trigger: 'worker',
      note: 'max delivery attempts reached',
    });
  }
}

/**
 * Returns whether enough time has passed to auto-retry delivery.
 *
 * @param lastAttemptedAt - Timestamp of the previous delivery attempt
 */
export function canAutoRetryDelivery(lastAttemptedAt: Date): boolean {
  const intervalMs = FULFILLMENT_CONFIG.deliveryRetryIntervalSeconds * 1000;
  return Date.now() - lastAttemptedAt.getTime() >= intervalMs;
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

async function signedUrlForPath(supabase: DbClient, storagePath: string): Promise<string> {
  if (supabase.storage === undefined) {
    throw new FulfillmentError('STORAGE_UNAVAILABLE', GENERIC_FULFILLMENT_ERROR, 500);
  }
  const { data, error } = await supabase.storage
    .from(PRODUCT_FILES_BUCKET)
    .createSignedUrl(storagePath, FULFILLMENT_CONFIG.downloadUrlExpirySeconds);
  if (error || data === null) {
    throw new FulfillmentError('SIGNED_URL_FAILED', GENERIC_FULFILLMENT_ERROR, 500);
  }
  return data.signedUrl;
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

/**
 * Delivers a signed file URL to the customer's Telegram chat.
 *
 * @param supabase - Database client
 * @param order - Order to deliver
 * @param signedUrl - Fresh signed download URL
 */
export async function deliverViaBot(supabase: DbClient, order: Order, signedUrl: string): Promise<void> {
  const product = await getProduct(supabase, order.productId);
  const fulfillments = await listFulfillmentAttempts(supabase, order.id);
  const fulfillment = fulfillments[0];
  if (fulfillment === undefined) {
    throw new FulfillmentError('FULFILLMENT_ATTEMPT_MISSING', GENERIC_FULFILLMENT_ERROR, 500);
  }

  const existingDeliveries = await listAllDeliveryAttempts(supabase, order.id);
  if (existingDeliveries.length >= FULFILLMENT_CONFIG.maxDeliveryAttempts) {
    await markDeliveryUnreachable(supabase, order.id);
    return;
  }

  let current = await ensureDeliveryQueued(supabase, order.id);
  if (current.deliveryStatus === 'queued') {
    await recordTransition(supabase, order.id, 'delivery', 'queued', 'sending', {
      trigger: 'worker',
      note: 'sending via telegram',
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
    await sendFileDelivery(token, customer.telegramChatId, signedUrl, product.title);
    await completeDeliveryAttempt(supabase, attempt.id, { status: 'success', result: 'telegram document sent' });
    const latest = await getOrder(supabase, order.id);
    if (latest.deliveryStatus === 'sending') {
      await recordTransition(supabase, order.id, 'delivery', 'sending', 'sent', {
        trigger: 'worker',
        note: 'delivered via telegram',
      });
      enqueueOrderWebhook(supabase, order.tenantId, 'order.delivered', { orderId: order.id });
    }
  } catch (error: unknown) {
    logger.error('delivery via bot failed', {
      orderId: order.id,
      message: error instanceof Error ? error.message : 'unknown',
    });
    await completeDeliveryAttempt(supabase, attempt.id, {
      status: 'failed',
      error: 'delivery failed',
    });
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

/**
 * Sends the manual-fulfillment completion notice to the customer.
 *
 * @param supabase - Database client
 * @param order - Fulfilled order
 */
export async function deliverManualCompletion(supabase: DbClient, order: Order): Promise<void> {
  const fulfillments = await listFulfillmentAttempts(supabase, order.id);
  const fulfillment = fulfillments[0];
  if (fulfillment === undefined) {
    throw new FulfillmentError('FULFILLMENT_ATTEMPT_MISSING', GENERIC_FULFILLMENT_ERROR, 500);
  }
  const existingDeliveries = await listAllDeliveryAttempts(supabase, order.id);
  let current = await ensureDeliveryQueued(supabase, order.id);
  if (current.deliveryStatus === 'queued') {
    await recordTransition(supabase, order.id, 'delivery', 'queued', 'sending', {
      trigger: 'worker',
      note: 'sending completion notice',
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
    await sendTextDelivery(token, customer.telegramChatId, FULFILLMENT_CONFIG.delivery.orderDelivered);
    await completeDeliveryAttempt(supabase, attempt.id, { status: 'success', result: 'telegram text sent' });
    const latest = await getOrder(supabase, order.id);
    if (latest.deliveryStatus === 'sending') {
      await recordTransition(supabase, order.id, 'delivery', 'sending', 'sent', {
        trigger: 'worker',
        note: 'manual completion notice sent',
      });
      enqueueOrderWebhook(supabase, order.tenantId, 'order.delivered', { orderId: order.id });
    }
  } catch (error: unknown) {
    logger.error('manual completion delivery failed', {
      orderId: order.id,
      message: error instanceof Error ? error.message : 'unknown',
    });
    await completeDeliveryAttempt(supabase, attempt.id, { status: 'failed', error: 'delivery failed' });
    const latest = await getOrder(supabase, order.id);
    if (latest.deliveryStatus === 'sending') {
      await recordTransition(supabase, order.id, 'delivery', 'sending', 'retry_pending', {
        trigger: 'worker',
        note: 'completion notice retry pending',
      });
    }
  }
}

/**
 * Fulfills a file or inventory product: signed URL + Telegram delivery.
 *
 * @param supabase - Database client
 * @param order - Queued order
 * @param fulfillmentAttempt - Open attempt row
 */
export async function fulfillFile(
  supabase: DbClient,
  order: Order,
  fulfillmentAttempt: FulfillmentAttempt,
): Promise<void> {
  const product = await getProductWithAssets(supabase, order.productId);
  const asset = product.assets.find((item) => !item.isPreview);
  if (asset === undefined) {
    throw new FulfillmentError('ASSET_MISSING', GENERIC_FULFILLMENT_ERROR, 500);
  }
  const signedUrl = await generateDownloadUrl(
    supabase,
    asset.id,
    FULFILLMENT_CONFIG.downloadUrlExpirySeconds,
  );
  const { error } = await supabase
    .from('fulfillment_attempts')
    .update({ artifact_path: asset.storagePath })
    .eq('id', fulfillmentAttempt.id);
  if (error) {
    throw new AppError('FULFILLMENT_UPDATE_FAILED', error.message, 500);
  }

  const latest = await getOrder(supabase, order.id);
  await consumeIfReserved(supabase, latest);
  const afterConsume = await getOrder(supabase, order.id);
  if (afterConsume.fulfillmentStatus === 'queued') {
    await recordTransition(supabase, afterConsume.id, 'fulfillment', 'queued', 'ready', {
      trigger: 'worker',
      note: 'file ready for delivery',
    });
    enqueueOrderWebhook(supabase, afterConsume.tenantId, 'order.fulfilled', { orderId: afterConsume.id });
  }
  await deliverViaBot(supabase, await getOrder(supabase, order.id), signedUrl);
}

/**
 * Places a manual order in owner-action state and notifies the customer.
 *
 * @param supabase - Database client
 * @param order - Queued order
 * @param fulfillmentAttempt - Open attempt row
 */
export async function fulfillManual(
  supabase: DbClient,
  order: Order,
  fulfillmentAttempt: FulfillmentAttempt,
): Promise<void> {
  const product = await getProduct(supabase, order.productId);
  if (order.fulfillmentStatus === 'queued') {
    await recordTransition(supabase, order.id, 'fulfillment', 'queued', 'manual_pending', {
      trigger: 'worker',
      note: 'awaiting owner fulfillment',
    });
  }
  if (order.customerId) {
    try {
      const customer = await getCustomerById(supabase, order.customerId);
      const token = await resolveBotToken(supabase, order);
      if (token) {
        await sendTextDelivery(
          token,
          customer.telegramChatId,
          FULFILLMENT_CONFIG.delivery.manualDeliveryPending(product.estimatedDeliveryMinutes),
        );
      }
    } catch (error: unknown) {
      logger.error('manual pending customer notice failed', {
        orderId: order.id,
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
  logger.info('manual fulfillment pending owner action', {
    orderId: order.id,
    attemptId: fulfillmentAttempt.id,
  });
}

/**
 * Processes a single queued order through the fulfillment pipeline.
 *
 * @param supabase - Service-role database client
 * @param orderId - Order UUID
 */
export async function processQueuedOrder(supabase: DbClient, orderId: string): Promise<FulfillmentResult> {
  const order = await getOrder(supabase, orderId);
  if (order.fulfillmentStatus !== 'queued') {
    throw new AppError('ORDER_NOT_QUEUED', 'Order is not queued for fulfillment', 400);
  }

  const product = await getProduct(supabase, order.productId);
  const method = methodForDeliveryType(product.deliveryType);
  const attempt = await createFulfillmentAttempt(supabase, order.id, method);

  try {
    if (product.deliveryType === 'file_reusable' || product.deliveryType === 'inventory_unit') {
      await fulfillFile(supabase, order, attempt);
      await completeFulfillmentAttempt(supabase, attempt.id, { status: 'success' });
    } else if (product.deliveryType === 'manual') {
      await fulfillManual(supabase, order, attempt);
      await completeFulfillmentAttempt(supabase, attempt.id, { status: 'success' });
    } else {
      await fulfillSupplierOrder(supabase, order, attempt);
    }
    const latest = await getOrder(supabase, order.id);
    return {
      success: latest.fulfillmentStatus !== 'failed',
      method,
      fulfillmentAttemptId: attempt.id,
    };
  } catch (error: unknown) {
    logger.error('fulfillment failed', {
      orderId: order.id,
      message: error instanceof Error ? error.message : 'unknown',
    });
    await completeFulfillmentAttempt(supabase, attempt.id, {
      status: 'failed',
      error: GENERIC_FULFILLMENT_ERROR,
    });
    await markFulfillmentFailed(supabase, order, GENERIC_FULFILLMENT_ERROR);
    return {
      success: false,
      method,
      fulfillmentAttemptId: attempt.id,
      error: GENERIC_FULFILLMENT_ERROR,
    };
  }
}

/**
 * Owner marks a manual order as fulfilled and notifies the customer.
 *
 * @param supabase - Database client
 * @param orderId - Order UUID
 * @param actorId - Owner profile id
 * @param note - Optional internal note
 */
export async function markManualFulfilled(
  supabase: DbClient,
  orderId: string,
  actorId: string,
  note?: string,
): Promise<void> {
  const order = await getOrder(supabase, orderId);
  if (order.fulfillmentStatus !== 'manual_pending') {
    throw new FulfillmentError('NOT_MANUAL_PENDING', 'This order is not waiting on manual fulfillment');
  }

  await consumeIfReserved(supabase, order);
  await recordTransition(supabase, orderId, 'fulfillment', 'manual_pending', 'ready', {
    actorId,
    trigger: 'manual',
    note: note ?? 'owner marked fulfilled',
  });
  enqueueOrderWebhook(supabase, order.tenantId, 'order.fulfilled', { orderId });

  const attempts = await listFulfillmentAttempts(supabase, orderId);
  const latestAttempt = attempts[0];
  if (latestAttempt) {
    const { error } = await supabase
      .from('fulfillment_attempts')
      .update({ fulfilled_by: actorId, status: 'success', completed_at: new Date().toISOString() })
      .eq('id', latestAttempt.id);
    if (error) {
      throw new AppError('FULFILLMENT_UPDATE_FAILED', error.message, 500);
    }
  }

  const ready = await getOrder(supabase, orderId);
  await deliverManualCompletion(supabase, ready);
  await writeAuditLog(supabase, {
    actorId,
    action: 'fulfillment.manual.complete',
    targetId: orderId,
    reason: note ?? 'owner marked fulfilled',
    afterVal: { fulfillmentStatus: 'ready' },
  });
}

/**
 * Retries Telegram delivery for retry_pending or unreachable orders.
 *
 * @param supabase - Database client
 * @param orderId - Order UUID
 */
export async function retryDelivery(supabase: DbClient, orderId: string): Promise<void> {
  const order = await getOrder(supabase, orderId);
  if (order.deliveryStatus !== 'retry_pending' && order.deliveryStatus !== 'unreachable') {
    throw new FulfillmentError('DELIVERY_NOT_RETRYABLE', 'Delivery cannot be retried for this order');
  }

  const deliveries = await listAllDeliveryAttempts(supabase, orderId);
  if (deliveries.length >= FULFILLMENT_CONFIG.maxDeliveryAttempts) {
    await markDeliveryUnreachable(supabase, orderId);
    return;
  }

  const lastAttempt = deliveries[0];
  if (lastAttempt && !canAutoRetryDelivery(lastAttempt.attemptedAt)) {
    logger.info('delivery retry requested before auto interval', { orderId: order.id });
  }

  const fulfillments = await listFulfillmentAttempts(supabase, orderId);
  if (fulfillments.some((item) => item.method === 'supplier')) {
    const delivered = await retrySupplierDelivery(supabase, order);
    if (delivered) {
      return;
    }
  }
  const artifactPath = fulfillments.find((item) => item.artifactPath)?.artifactPath ?? null;
  const product = await getProductWithAssets(supabase, order.productId);
  let signedUrl: string;
  if (artifactPath && !fulfillments.some((item) => item.method === 'supplier')) {
    signedUrl = await signedUrlForPath(supabase, artifactPath);
  } else {
    const asset = product.assets.find((item) => !item.isPreview);
    if (asset === undefined) {
      await deliverManualCompletion(supabase, order);
      return;
    }
    signedUrl = await generateDownloadUrl(
      supabase,
      asset.id,
      FULFILLMENT_CONFIG.downloadUrlExpirySeconds,
    );
  }
  await deliverViaBot(supabase, order, signedUrl);
}

/**
 * Returns fulfillment and delivery state for the owner dashboard.
 *
 * @param supabase - Database client
 * @param orderId - Order UUID
 */
export async function getOrderFulfillmentStatus(
  supabase: DbClient,
  orderId: string,
): Promise<OrderFulfillmentStatusSnapshot> {
  const order = await getOrder(supabase, orderId);
  const fulfillmentAttempts = await listFulfillmentAttempts(supabase, orderId);
  const deliveryAttempts = await listAllDeliveryAttempts(supabase, orderId);
  return {
    fulfillment: order.fulfillmentStatus,
    delivery: order.deliveryStatus,
    fulfillmentAttempts,
    deliveryAttempts,
  };
}

/**
 * Safety-net processor for queued fulfillments (cron).
 *
 * @param supabase - Service-role database client
 */
export async function processQueuedFulfillments(
  supabase: DbClient,
): Promise<{ processed: number; failed: number }> {
  const queued = await listOrders(supabase, { fulfillmentStatus: 'queued', limit: 50 });
  const timeoutMs = FULFILLMENT_CONFIG.fulfillmentTimeoutMinutes * 60 * 1000;
  let processed = 0;
  let failed = 0;
  for (const order of queued) {
    const stuck = Date.now() - order.updatedAt.getTime() > timeoutMs;
    if (stuck) {
      logger.warn('fulfillment queue item exceeded timeout', { orderId: order.id });
    }
    const result = await processQueuedOrder(supabase, order.id);
    processed += 1;
    if (!result.success) {
      failed += 1;
    }
  }
  return { processed, failed };
}

/**
 * Owner-facing order tab filters.
 */
export type OwnerOrderTab =
  | 'all'
  | 'awaiting_payment'
  | 'pending_fulfillment'
  | 'manual_pending'
  | 'completed'
  | 'failed';

/**
 * Returns whether an order belongs on an owner orders tab.
 *
 * @param order - Order
 * @param tab - Selected tab
 */
export function matchesOwnerOrderTab(order: Order, tab: OwnerOrderTab): boolean {
  if (tab === 'all') {
    return true;
  }
  if (tab === 'awaiting_payment') {
    return order.paymentStatus === 'awaiting' || order.paymentStatus === 'pending_verification';
  }
  if (tab === 'pending_fulfillment') {
    return order.fulfillmentStatus === 'queued' || order.fulfillmentStatus === 'supplier_pending';
  }
  if (tab === 'manual_pending') {
    return order.fulfillmentStatus === 'manual_pending';
  }
  if (tab === 'completed') {
    return order.fulfillmentStatus === 'ready' && order.deliveryStatus === 'sent';
  }
  return (
    order.fulfillmentStatus === 'failed' ||
    order.deliveryStatus === 'unreachable' ||
    order.paymentStatus === 'failed'
  );
}

/**
 * Returns whether a reseller order is active, completed, or failed.
 *
 * @param order - Order
 * @param tab - Reseller tab
 */
export function matchesResellerOrderTab(order: Order, tab: 'active' | 'completed' | 'failed'): boolean {
  const failed =
    order.fulfillmentStatus === 'failed' ||
    order.deliveryStatus === 'unreachable' ||
    order.paymentStatus === 'failed';
  const completed = order.fulfillmentStatus === 'ready' && order.deliveryStatus === 'sent';
  if (tab === 'failed') {
    return failed;
  }
  if (tab === 'completed') {
    return completed;
  }
  return !failed && !completed;
}

/**
 * True when a manual order has waited longer than the reminder window.
 *
 * @param createdAt - Order created time
 */
export function isManualFulfillmentOverdue(createdAt: Date): boolean {
  const reminderMs = FULFILLMENT_CONFIG.manualFulfillmentReminderHours * 60 * 60 * 1000;
  return Date.now() - createdAt.getTime() >= reminderMs;
}
