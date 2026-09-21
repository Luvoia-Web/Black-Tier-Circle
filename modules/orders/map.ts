/**
 * @file modules/orders/map.ts
 *
 * Maps orders and order_events rows to domain types.
 *
 * @module Orders
 */

import { asMinorUnits } from '@/modules/catalog/map';
import type {
  DeliveryStatus,
  FulfillmentStatus,
  FundingStatus,
  Order,
  OrderChannel,
  OrderEvent,
  OrderEventRow,
  OrderRow,
  OrderTrack,
  PaymentStatus,
} from './types';

function asChannel(value: string): OrderChannel {
  if (value === 'owner_store' || value === 'reseller_bot' || value === 'api') {
    return value;
  }
  return 'api';
}

function asTrigger(value: string | null): OrderEvent['trigger'] {
  if (value === 'webhook' || value === 'worker' || value === 'manual' || value === 'api') {
    return value;
  }
  return 'api';
}

function asTrack(value: string): OrderTrack {
  if (value === 'payment' || value === 'funding' || value === 'fulfillment' || value === 'delivery') {
    return value;
  }
  return 'payment';
}

/**
 * Maps an orders table row.
 *
 * @param row - Database row
 */
export function mapOrderRow(row: OrderRow): Order {
  return {
    id: row.id,
    channel: asChannel(row.channel),
    tenantId: row.tenant_id,
    botId: row.bot_id,
    customerId: row.customer_id,
    productId: row.product_id,
    productVersion: row.product_version,
    quotedRetailPriceMinor: asMinorUnits(row.quoted_retail_price),
    quotedWholesalePriceMinor: asMinorUnits(row.quoted_wholesale_price),
    currency: 'USDT',
    paymentMethod: row.payment_method === 'binance_pay' || row.payment_method === 'usdt_bep20' ? row.payment_method : null,
    externalOrderRef: row.external_order_ref ?? null,
    paymentStatus: row.payment_status as PaymentStatus,
    fundingStatus: row.funding_status as FundingStatus,
    fulfillmentStatus: row.fulfillment_status as FulfillmentStatus,
    deliveryStatus: row.delivery_status as DeliveryStatus,
    idempotencyKey: row.idempotency_key ?? '',
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Maps an order_events table row.
 *
 * @param row - Database row
 */
export function mapOrderEventRow(row: OrderEventRow): OrderEvent {
  return {
    id: row.id,
    orderId: row.order_id,
    track: asTrack(row.track),
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actorId: row.actor_id,
    trigger: asTrigger(row.trigger),
    note: row.note,
    createdAt: new Date(row.created_at),
  };
}
