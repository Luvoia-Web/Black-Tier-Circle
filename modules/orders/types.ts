/**
 * @file modules/orders/types.ts
 *
 * Order types matching the four independent state tracks.
 *
 * @module Orders
 */

export type OrderChannel = 'owner_store' | 'reseller_bot' | 'api';

export type OrderPaymentStatus =
  | 'not_required'
  | 'awaiting'
  | 'pending_verification'
  | 'verified'
  | 'failed'
  | 'expired'
  | 'refund_pending'
  | 'refunded'
  | 'disputed';

export type OrderFundingStatus =
  | 'not_applicable'
  | 'reserved'
  | 'debited'
  | 'released'
  | 'reversal_pending'
  | 'reversed';

export type OrderFulfillmentStatus =
  | 'queued'
  | 'manual_pending'
  | 'supplier_pending'
  | 'outcome_unknown'
  | 'ready'
  | 'failed'
  | 'canceled';

export type OrderDeliveryStatus =
  | 'not_ready'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'retry_pending'
  | 'unreachable'
  | 'review_required';

export type OrderTrack = 'payment' | 'funding' | 'fulfillment' | 'delivery';

export type Order = {
  readonly id: string;
  readonly channel: OrderChannel;
  readonly tenantId: string | null;
  readonly productId: string;
  readonly productVersion: number;
  readonly quotedRetailPriceMinor: bigint;
  readonly quotedWholesalePriceMinor: bigint;
  readonly currency: 'USDT';
  readonly paymentStatus: OrderPaymentStatus;
  readonly fundingStatus: OrderFundingStatus;
  readonly fulfillmentStatus: OrderFulfillmentStatus;
  readonly deliveryStatus: OrderDeliveryStatus;
  readonly idempotencyKey: string;
};

export type OrderEvent = {
  readonly orderId: string;
  readonly track: OrderTrack;
  readonly fromStatus: string | null;
  readonly toStatus: string;
  readonly trigger: 'webhook' | 'worker' | 'manual' | 'api';
};
