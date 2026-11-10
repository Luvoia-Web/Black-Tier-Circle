/**
 * One open checkout per customer, bot, and product.
 * The idempotency key is the buyer action (customer + product + quantity + time bucket),
 * never the Telegram update id.
 */

import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { getOrder, updateOrderQuantity, createOrder } from '@/modules/orders';
import type { CreateOrderInput, Order } from '@/modules/orders/types';

export const CHECKOUT_WINDOW_MS = 15 * 60 * 1000;

const checkoutLocks = new Map<string, Promise<Order>>();

export function checkoutBucket(at: Date = new Date()): number {
  return Math.floor(at.getTime() / CHECKOUT_WINDOW_MS);
}

export function checkoutIdempotencyKey(input: {
  readonly botId: string;
  readonly customerId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly at?: Date;
}): string {
  const bot = input.botId === 'owner' ? 'owner' : input.botId;
  return `tg:${bot}:${input.customerId}:${input.productId}:${input.quantity}:${checkoutBucket(input.at)}`;
}

export function closedCheckoutKey(orderId: string): string {
  return `tg-closed:${orderId}`;
}

export function isCheckoutExpired(order: Order, now: Date = new Date()): boolean {
  return now.getTime() - order.createdAt.getTime() > CHECKOUT_WINDOW_MS;
}

function sameBot(orderBotId: string | null, botId: string): boolean {
  if (botId === 'owner') {
    return orderBotId === null || orderBotId === 'owner';
  }
  return orderBotId === botId;
}

function isOpenPayment(status: string): boolean {
  return status === 'awaiting' || status === 'pending_verification';
}

export async function findOpenCheckout(
  supabase: DbClient,
  input: { readonly customerId: string; readonly botId: string; readonly productId: string },
): Promise<Order | null> {
  const result = (await supabase
    .from('orders')
    .select('*')
    .eq('customer_id', input.customerId)
    .eq('product_id', input.productId)
    .order('created_at', { ascending: false })
    .limit(20)) as QueryResult<unknown[] | null>;
  if (result.error || !Array.isArray(result.data)) {
    return null;
  }
  const { mapOrderRow } = await import('@/modules/orders/map');
  for (const row of result.data) {
    const order = mapOrderRow(row as Parameters<typeof mapOrderRow>[0]);
    if (!sameBot(order.botId, input.botId) || !isOpenPayment(order.paymentStatus)) {
      continue;
    }
    if (isCheckoutExpired(order)) {
      continue;
    }
    return order;
  }
  return null;
}

async function openCheckoutUnlocked(supabase: DbClient, input: CreateOrderInput): Promise<Order> {
  if (!input.customerId) {
    return createOrder(supabase, input);
  }
  const open = await findOpenCheckout(supabase, {
    customerId: input.customerId,
    botId: input.botId,
    productId: input.productId,
  });
  if (open) {
    if (open.paymentStatus === 'pending_verification' || open.quantity === (input.quantity ?? 1)) {
      return open;
    }
    return updateOrderQuantity(supabase, open.id, input.quantity ?? 1);
  }
  const quantity = input.quantity ?? 1;
  return createOrder(supabase, {
    ...input,
    quantity,
    idempotencyKey: checkoutIdempotencyKey({
      botId: input.botId,
      customerId: input.customerId,
      productId: input.productId,
      quantity,
    }),
  });
}

/**
 * Reuses the buyer's open unpaid order for this product, or creates one.
 * Concurrent calls in the same isolate share one create.
 */
export function openCheckoutOrder(supabase: DbClient, input: CreateOrderInput): Promise<Order> {
  const lockKey = `${input.customerId ?? 'none'}:${input.botId}:${input.productId}`;
  const pending = checkoutLocks.get(lockKey);
  if (pending) {
    return pending;
  }
  const run = openCheckoutUnlocked(supabase, input);
  checkoutLocks.set(lockKey, run);
  return run.finally(() => {
    checkoutLocks.delete(lockKey);
  });
}

export async function releaseCheckoutKey(supabase: DbClient, orderId: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ idempotency_key: closedCheckoutKey(orderId), updated_at: new Date().toISOString() })
    .eq('id', orderId);
  if (error) {
    const { AppError } = await import('@/lib/errors');
    throw new AppError('ORDER_UPDATE_FAILED', error.message, 500);
  }
}

export async function assertCheckoutOpen(order: Order): Promise<void> {
  if (order.paymentStatus === 'verified' || order.paymentStatus === 'refunded') {
    return;
  }
  if (!isOpenPayment(order.paymentStatus)) {
    return;
  }
  if (!isCheckoutExpired(order)) {
    return;
  }
  const { ValidationError } = await import('@/lib/errors');
  throw new ValidationError('ORDER_EXPIRED', 'This order expired. Please start again.');
}

export async function reloadIfPresent(supabase: DbClient, orderId: string): Promise<Order | null> {
  try {
    return await getOrder(supabase, orderId);
  } catch {
    return null;
  }
}
