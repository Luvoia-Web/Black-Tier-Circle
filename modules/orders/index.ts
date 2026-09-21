/**
 * @file modules/orders/index.ts
 *
 * Orders public API: create, list, cancel, and event history.
 *
 * @module Orders
 */

import { randomUUID } from 'node:crypto';
import { AppError, NotFoundError, TenantError, ValidationError } from '@/lib/errors';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { getProduct } from '@/modules/catalog';
import { getListing } from '@/modules/pricing';
import { getTenantById } from '@/modules/tenants';
import { getWallet, releaseReservation, reserveFunds } from '@/modules/wallet';
import { mapOrderEventRow, mapOrderRow } from './map';
import { recordInitialStatuses, recordTransition } from './state-machine';
import type {
  CreateOrderInput,
  ListOrdersFilters,
  Order,
  OrderEvent,
  OrderEventRow,
  OrderRow,
} from './types';

export type {
  CreateOrderInput,
  DeliveryStatus,
  FulfillmentStatus,
  FundingStatus,
  ListOrdersFilters,
  Order,
  OrderChannel,
  OrderDeliveryStatus,
  OrderEvent,
  OrderFulfillmentStatus,
  OrderFundingStatus,
  OrderPaymentStatus,
  OrderTrack,
  PaymentStatus,
} from './types';
export {
  canTransitionDelivery,
  canTransitionFulfillment,
  canTransitionFunding,
  canTransitionPayment,
  recordTransition,
  transitionDelivery,
  transitionFulfillment,
  transitionFunding,
  transitionPayment,
} from './state-machine';

function asOrderRow(data: unknown): OrderRow {
  return data as OrderRow;
}

function asEventRow(data: unknown): OrderEventRow {
  return data as OrderEventRow;
}

const RESERVATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Creates an order with price snapshots and optional wallet reservation.
 * Duplicate idempotency keys return the existing order.
 *
 * @param supabase - Database client
 * @param input - Channel, product, customer, and required idempotency key
 */
export async function createOrder(supabase: DbClient, input: CreateOrderInput): Promise<Order> {
  if (!input.idempotencyKey) {
    throw new ValidationError('IDEMPOTENCY_REQUIRED', 'Order creation requires an idempotency key');
  }

  const existing = await supabase
    .from('orders')
    .select('*')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();
  if (existing.error) {
    throw new AppError('ORDER_LOOKUP_FAILED', existing.error.message, 500);
  }
  if (existing.data !== null) {
    return mapOrderRow(asOrderRow(existing.data));
  }

  const product = await getProduct(supabase, input.productId);
  if (product.status !== 'published') {
    throw new ValidationError('PRODUCT_NOT_AVAILABLE', 'Product is not available for purchase');
  }

  const isReseller = input.channel === 'reseller_bot';
  if (isReseller) {
    if (input.tenantId === undefined) {
      throw new ValidationError('TENANT_REQUIRED', 'Reseller orders require a tenant');
    }
    const tenant = await getTenantById(supabase, input.tenantId);
    if (tenant.status !== 'active') {
      throw new TenantError('TENANT_NOT_ACTIVE', 'Reseller account is not active', 403);
    }
    const listing = await getListing(supabase, input.tenantId, input.productId);
    if (!listing.isVisible) {
      throw new ValidationError('PRODUCT_NOT_AVAILABLE', 'Product is not available for purchase');
    }
  }

  const quotedRetailPrice = isReseller
    ? (await getListing(supabase, input.tenantId as string, input.productId)).retailPriceMinor
    : product.retailPriceMinor;
  const quotedWholesalePrice = product.wholesalePriceMinor;
  const paymentStatus = 'awaiting';
  const fundingStatus = isReseller ? 'reserved' : 'not_applicable';
  const orderId = randomUUID();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('orders')
    .insert({
      id: orderId,
      channel: input.channel,
      tenant_id: isReseller ? (input.tenantId ?? null) : null,
      bot_id: input.botId === 'owner' ? null : input.botId,
      customer_id: input.customerId,
      product_id: input.productId,
      product_version: product.version,
      quoted_retail_price: quotedRetailPrice.toString(),
      quoted_wholesale_price: quotedWholesalePrice.toString(),
      currency: 'USDT',
      payment_status: paymentStatus,
      funding_status: fundingStatus,
      fulfillment_status: 'queued',
      delivery_status: 'not_ready',
      idempotency_key: input.idempotencyKey,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('ORDER_CREATE_FAILED', error?.message ?? 'Unable to create order', 500);
  }

  const order = mapOrderRow(asOrderRow(data));

  if (isReseller && input.tenantId !== undefined) {
    const wallet = await getWallet(supabase, input.tenantId);
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
    try {
      await reserveFunds(supabase, wallet.id, order.id, quotedWholesalePrice, expiresAt);
    } catch (reserveError: unknown) {
      await supabase
        .from('orders')
        .update({
          funding_status: 'released',
          fulfillment_status: 'canceled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);
      throw reserveError;
    }
  }

  await recordInitialStatuses(
    supabase,
    order.id,
    {
      payment: paymentStatus,
      funding: fundingStatus,
      fulfillment: 'queued',
      delivery: 'not_ready',
    },
    'webhook',
  );

  return order;
}

/**
 * Loads an order by id.
 *
 * @param supabase - Database client
 * @param orderId - Order UUID
 */
export async function getOrder(supabase: DbClient, orderId: string): Promise<Order> {
  const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (error) {
    throw new AppError('ORDER_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null) {
    throw new NotFoundError('order');
  }
  return mapOrderRow(asOrderRow(data));
}

/**
 * Lists orders with optional filters.
 *
 * @param supabase - Database client
 * @param filters - Tenant, bot, payment status, and pagination
 */
export async function listOrders(supabase: DbClient, filters: ListOrdersFilters = {}): Promise<Order[]> {
  let query = supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (filters.tenantId !== undefined) {
    query = query.eq('tenant_id', filters.tenantId);
  }
  if (filters.botId !== undefined) {
    query = query.eq('bot_id', filters.botId);
  }
  if (filters.customerId !== undefined) {
    query = query.eq('customer_id', filters.customerId);
  }
  if (filters.paymentStatus !== undefined) {
    query = query.eq('payment_status', filters.paymentStatus);
  }
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  query = query.range(offset, offset + limit - 1);
  const result = (await query) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('ORDER_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((row) => mapOrderRow(asOrderRow(row)));
}

/**
 * Returns append-only events for an order.
 *
 * @param supabase - Database client
 * @param orderId - Order UUID
 */
export async function getOrderEvents(supabase: DbClient, orderId: string): Promise<OrderEvent[]> {
  const result = (await supabase
    .from('order_events')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('ORDER_EVENT_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((row) => mapOrderEventRow(asEventRow(row)));
}

/**
 * Cancels fulfillment and releases a wallet reservation when funding is reserved.
 *
 * @param supabase - Database client
 * @param orderId - Order UUID
 * @param reason - Cancellation reason
 */
export async function cancelOrder(supabase: DbClient, orderId: string, reason: string): Promise<void> {
  const order = await getOrder(supabase, orderId);
  await recordTransition(supabase, orderId, 'fulfillment', order.fulfillmentStatus, 'canceled', {
    trigger: 'manual',
    note: reason,
  });
  if (order.fundingStatus === 'reserved') {
    await releaseReservation(supabase, orderId, reason);
    await recordTransition(supabase, orderId, 'funding', 'reserved', 'released', {
      trigger: 'manual',
      note: reason,
    });
  }
}
