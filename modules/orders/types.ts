/**
 * @file modules/orders/types.ts
 *
 * Order types matching the four independent state tracks.
 *
 * @module Orders
 */

export type OrderChannel = 'owner_store' | 'reseller_bot' | 'api';

export type PaymentStatus =
  | 'not_required'
  | 'awaiting'
  | 'pending_verification'
  | 'verified'
  | 'failed'
  | 'expired'
  | 'refund_pending'
  | 'refunded'
  | 'disputed';

export type FundingStatus =
  | 'not_applicable'
  | 'reserved'
  | 'debited'
  | 'released'
  | 'reversal_pending'
  | 'reversed';

export type FulfillmentStatus =
  | 'queued'
  | 'manual_pending'
  | 'supplier_pending'
  | 'outcome_unknown'
  | 'ready'
  | 'failed'
  | 'canceled';

export type DeliveryStatus =
  | 'not_ready'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'retry_pending'
  | 'unreachable'
  | 'review_required';

export type OrderPaymentStatus = PaymentStatus;
export type OrderFundingStatus = FundingStatus;
export type OrderFulfillmentStatus = FulfillmentStatus;
export type OrderDeliveryStatus = DeliveryStatus;

export type OrderTrack = 'payment' | 'funding' | 'fulfillment' | 'delivery';

export type Order = {
  readonly id: string;
  readonly channel: OrderChannel;
  readonly tenantId: string | null;
  readonly botId: string | null;
  readonly customerId: string | null;
  readonly productId: string;
  readonly productVersion: number;
  readonly quotedRetailPriceMinor: bigint;
  readonly quotedWholesalePriceMinor: bigint;
  readonly currency: 'USDT';
  readonly paymentStatus: PaymentStatus;
  readonly fundingStatus: FundingStatus;
  readonly fulfillmentStatus: FulfillmentStatus;
  readonly deliveryStatus: DeliveryStatus;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type OrderEvent = {
  readonly id: string;
  readonly orderId: string;
  readonly track: OrderTrack;
  readonly fromStatus: string | null;
  readonly toStatus: string;
  readonly actorId: string | null;
  readonly trigger: 'webhook' | 'worker' | 'manual' | 'api';
  readonly note: string | null;
  readonly createdAt: Date;
};

export type CreateOrderInput = {
  readonly channel: OrderChannel;
  readonly tenantId?: string;
  readonly botId: string;
  readonly customerId: string;
  readonly productId: string;
  readonly idempotencyKey: string;
};

export type ListOrdersFilters = {
  readonly tenantId?: string;
  readonly botId?: string;
  readonly customerId?: string;
  readonly paymentStatus?: PaymentStatus;
  readonly limit?: number;
  readonly offset?: number;
};

export type RecordTransitionOptions = {
  readonly actorId?: string;
  readonly trigger?: OrderEvent['trigger'];
  readonly note?: string;
};

export type OrderRow = {
  readonly id: string;
  readonly channel: string;
  readonly tenant_id: string | null;
  readonly bot_id: string | null;
  readonly customer_id: string | null;
  readonly product_id: string;
  readonly product_version: number;
  readonly quoted_retail_price: string | number | bigint;
  readonly quoted_wholesale_price: string | number | bigint;
  readonly currency: string;
  readonly payment_status: string;
  readonly funding_status: string;
  readonly fulfillment_status: string;
  readonly delivery_status: string;
  readonly idempotency_key: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type OrderEventRow = {
  readonly id: string;
  readonly order_id: string;
  readonly track: string;
  readonly from_status: string | null;
  readonly to_status: string;
  readonly actor_id: string | null;
  readonly trigger: string | null;
  readonly note: string | null;
  readonly created_at: string;
};
