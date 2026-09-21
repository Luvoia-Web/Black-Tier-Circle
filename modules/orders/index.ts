/**
 * @file modules/orders/index.ts
 *
 * Orders public API with sandbox create + state helpers.
 *
 * @module Orders
 */

import { ValidationError } from '@/lib/errors';
import { quoteProductPrice } from '@/modules/pricing';
import { randomUUID } from 'node:crypto';
import type { Order, OrderChannel } from './types';

export type { Order, OrderChannel, OrderEvent, OrderTrack } from './types';
export {
  transitionDelivery,
  transitionFulfillment,
  transitionFunding,
  transitionPayment,
} from './state-machine';

type CreateOrderParams = {
  readonly channel: OrderChannel;
  readonly productId: string;
  readonly idempotencyKey: string;
  readonly tenantId?: string;
  readonly resellerRetailPriceMinor?: bigint;
};

const createdByKey = new Map<string, Order>();

/**
 * Creates a sandbox order with server-side price snapshots.
 *
 * @param params - Channel, product, and required idempotency key
 * @returns Created or previously created order for the same key
 * @throws ValidationError when the idempotency key is missing
 */
export function createOrder(params: CreateOrderParams): Order {
  if (!params.idempotencyKey) {
    throw new ValidationError('IDEMPOTENCY_REQUIRED', 'Order creation requires an idempotency key');
  }
  const existing = createdByKey.get(params.idempotencyKey);
  if (existing) {
    return existing;
  }
  const quote =
    params.resellerRetailPriceMinor === undefined
      ? quoteProductPrice(params.productId)
      : quoteProductPrice(params.productId, params.resellerRetailPriceMinor);
  const isReseller = params.channel !== 'owner_store';
  const order: Order = {
    id: randomUUID(),
    channel: params.channel,
    tenantId: params.tenantId === undefined ? null : params.tenantId,
    productId: quote.productId,
    productVersion: quote.productVersion,
    quotedRetailPriceMinor: quote.retailPriceMinor,
    quotedWholesalePriceMinor: quote.wholesalePriceMinor,
    currency: 'USDT',
    paymentStatus: isReseller ? 'not_required' : 'awaiting',
    fundingStatus: isReseller ? 'reserved' : 'not_applicable',
    fulfillmentStatus: 'queued',
    deliveryStatus: 'not_ready',
    idempotencyKey: params.idempotencyKey,
  };
  createdByKey.set(params.idempotencyKey, order);
  return order;
}
