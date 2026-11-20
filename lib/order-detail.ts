/**
 * @file lib/order-detail.ts
 *
 * Shared types and display helpers for the order detail drawer.
 *
 * The GET /api/orders/[orderId]/detail route and OrderDetailModal both
 * depend on this shape so bigint money stays strings and UI labels stay
 * consistent across owner, reseller, and payment monitor surfaces.
 *
 * @module OrderDetail
 */

import { formatUsdt } from '@/lib/money';
import type { DeliveryType } from '@/modules/catalog';
import type { OrderChannel } from '@/modules/orders';
import type { PaymentMethod } from '@/modules/payments';

export type OrderDetailOrder = {
  readonly id: string;
  readonly channel: OrderChannel;
  readonly paymentStatus: string;
  readonly fundingStatus: string;
  readonly fulfillmentStatus: string;
  readonly deliveryStatus: string;
  readonly quotedRetailPrice: string;
  readonly quotedWholesalePrice: string;
  readonly paymentMethod: PaymentMethod | null;
  readonly externalOrderRef: string | null;
  readonly idempotencyKey: string;
  readonly quantity: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly channelLabel: string;
};

export type OrderDetailProduct = {
  readonly title: string;
  readonly sku: string;
  readonly supplierSku: string | null;
  readonly deliveryType: DeliveryType;
  readonly sourceLabel: string;
};

export type OrderDetailCustomer = {
  readonly telegramUserId: string;
  readonly telegramChatId: string;
  readonly firstName: string | null;
  readonly username: string | null;
  readonly orderCount: number;
  readonly balance: string;
};

export type OrderDetailPaymentClaim = {
  readonly binanceOrderId: string | null;
  readonly txHash: string | null;
  readonly submittedAt: string;
  readonly verifiedAt: string | null;
  readonly rejectReason: string | null;
};

export type OrderDetailEvent = {
  readonly label: string;
  readonly at: string;
  readonly tone: 'ok' | 'fault' | 'neutral';
  readonly note: string | null;
};

export type OrderDetailFulfillmentAttempt = {
  readonly method: string;
  readonly status: string;
  readonly artifactPath: string | null;
  readonly completedAt: string | null;
  readonly error: string | null;
};

export type OrderDetailPayload = {
  readonly order: OrderDetailOrder;
  readonly product: OrderDetailProduct;
  readonly customer: OrderDetailCustomer | null;
  readonly paymentClaim: OrderDetailPaymentClaim | null;
  readonly fulfillmentAttempt: OrderDetailFulfillmentAttempt | null;
  readonly deliveredContent: string | null;
  readonly events: readonly OrderDetailEvent[];
  readonly replacementOpen: boolean;
  readonly canReplaceFromSupplier: boolean;
};

export type OrderHeaderBadge = 'paid' | 'pending' | 'failed' | 'verified';

const MONTHS: ReadonlyArray<string> = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const GENERIC_DELIVERY_RESULTS: ReadonlySet<string> = new Set([
  'telegram document sent',
  'telegram text sent',
  'supplier content sent',
]);

/**
 * Formats an ISO timestamp as "Sep 06, 2026, 03:40 PM".
 *
 * @param iso - ISO-8601 timestamp
 * @returns Localized display string, or "—" when invalid
 */
export function formatOrderTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const month = MONTHS[date.getMonth()] ?? 'Jan';
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  const minute = date.getMinutes().toString().padStart(2, '0');
  const meridiem = date.getHours() >= 12 ? 'PM' : 'AM';
  let hour = date.getHours() % 12;
  if (hour === 0) {
    hour = 12;
  }
  return `${month} ${day}, ${year}, ${hour.toString().padStart(2, '0')}:${minute} ${meridiem}`;
}

/**
 * Maps a stored payment method to the drawer label.
 *
 * @param method - Stored payment method, if any
 * @returns Human-readable method name
 */
export function paymentMethodLabel(method: PaymentMethod | null): string {
  if (method === 'binance_pay') {
    return 'Binance Pay';
  }
  if (method === 'usdt_bep20') {
    return 'USDT BEP20';
  }
  return 'Wallet Token';
}

/**
 * Truncates a payment reference for display while keeping copy-all intact.
 *
 * @param value - Full tx hash or Binance order id
 * @returns Up to 16 characters plus an ellipsis when longer
 */
export function truncatePaymentRef(value: string): string {
  if (value.length <= 16) {
    return value;
  }
  return `${value.slice(0, 16)}...`;
}

/**
 * Returns the payment reference to show, preferring the tx hash.
 *
 * @param claim - Latest payment claim, if any
 * @returns Full reference string, or null when none exists
 */
export function paymentRefValue(claim: OrderDetailPaymentClaim | null): string | null {
  if (claim === null) {
    return null;
  }
  if (claim.txHash && claim.txHash.length > 0) {
    return claim.txHash;
  }
  if (claim.binanceOrderId && claim.binanceOrderId.length > 0) {
    return claim.binanceOrderId;
  }
  return null;
}

/**
 * Picks a customer display label: @username, first name, then Telegram id.
 *
 * @param customer - Telegram customer record, if linked
 * @returns Display string, or "—" when missing
 */
export function customerDisplayName(customer: OrderDetailCustomer | null): string {
  if (customer === null) {
    return '—';
  }
  if (customer.username && customer.username.length > 0) {
    return `@${customer.username}`;
  }
  if (customer.firstName && customer.firstName.length > 0) {
    return customer.firstName;
  }
  return customer.telegramUserId;
}

/**
 * Label for the delivered-content box based on product delivery type.
 *
 * @param deliveryType - Catalog delivery type
 * @returns Uppercase section label
 */
export function deliveredContentLabel(deliveryType: DeliveryType): string {
  if (deliveryType === 'file_reusable' || deliveryType === 'inventory_unit') {
    return 'DELIVERED FILE';
  }
  if (deliveryType === 'manual') {
    return 'DELIVERED CODES';
  }
  return 'DELIVERED CONTENT';
}

/**
 * Header badge for the drawer title area.
 *
 * @param paymentStatus - Order payment track status
 * @returns One of paid / pending / failed / verified
 */
export function headerPaymentBadge(paymentStatus: string): OrderHeaderBadge {
  if (paymentStatus === 'verified') {
    return 'verified';
  }
  if (paymentStatus === 'not_required') {
    return 'paid';
  }
  if (paymentStatus === 'failed' || paymentStatus === 'expired' || paymentStatus === 'disputed') {
    return 'failed';
  }
  if (paymentStatus === 'refunded') {
    return 'failed';
  }
  return 'pending';
}

/**
 * Formats quoted retail minor units for the TOTAL row.
 *
 * @param minorUnits - USDT minor units serialized as a decimal string
 * @returns Display string such as "10.50 USDT"
 */
export function formatOrderTotal(minorUnits: string): string {
  return formatUsdt(BigInt(minorUnits));
}

/**
 * Returns whether an order was placed through a reseller channel.
 *
 * @param channel - Order channel
 */
export function isResellerOrderChannel(channel: OrderChannel): boolean {
  return channel === 'reseller_bot' || channel === 'api';
}

/**
 * Returns whether a delivery-attempt result is a generic status note, not content.
 *
 * @param result - Delivery attempt result text
 */
export function isGenericDeliveryResult(result: string): boolean {
  return GENERIC_DELIVERY_RESULTS.has(result);
}

/**
 * Formats an event detail note in sentence case (first letter capitalised).
 */
export function toSentenceCase(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export type OrderDrawerActions = {
  readonly isDelivered: boolean;
  readonly canCancel: boolean;
  readonly canMarkFulfilled: boolean;
  readonly canRefund: boolean;
  readonly canReplace: boolean;
};

/**
 * Determines which owner actions are shown in the order drawer.
 * Delivered orders hide Cancel and Mark fulfilled.
 */
export function availableOrderDrawerActions(order: {
  readonly deliveryStatus: string;
}): OrderDrawerActions {
  const isDelivered = order.deliveryStatus === 'sent';
  return {
    isDelivered,
    canCancel: !isDelivered,
    canMarkFulfilled: !isDelivered,
    canRefund: true,
    canReplace: isDelivered,
  };
}

export type RawTimelineEvent = {
  readonly track: string;
  readonly to: string;
  readonly label: string;
  readonly at: string;
  readonly note: string | null;
};

/**
 * Normalizes the order timeline:
 * - Formats detail notes in sentence case
 * - Labels a failed supplier attempt as "Supplier attempt failed, retried" when a later attempt succeeded
 * - Ensures a delivered order always ends with a "Delivered" event
 */
export function buildOrderTimeline(
  rawEvents: readonly RawTimelineEvent[],
  opts: {
    readonly deliveryStatus: string;
    readonly deliveredAt: string;
    readonly supplierReason: string | null;
  },
): OrderDetailEvent[] {
  const isDelivered = opts.deliveryStatus === 'sent';
  const hasLaterSuccess = (index: number): boolean => {
    if (isDelivered) return true;
    for (let i = index + 1; i < rawEvents.length; i += 1) {
      const next = rawEvents[i];
      if (!next) continue;
      if (
        (next.track === 'fulfillment' && next.to === 'ready') ||
        (next.track === 'delivery' && next.to === 'sent')
      ) {
        return true;
      }
    }
    return false;
  };

  const events: OrderDetailEvent[] = rawEvents.map((ev, index) => {
    const failed = ev.to === 'failed' || ev.to === 'unreachable' || ev.to === 'expired' || ev.to === 'outcome_unknown';
    const done = ev.to === 'verified' || ev.to === 'sent' || ev.to === 'ready';
    const isSupplierFailureRetried =
      ev.track === 'fulfillment' &&
      (ev.to === 'failed' || ev.to === 'outcome_unknown') &&
      hasLaterSuccess(index);
    return {
      label: isSupplierFailureRetried ? 'Supplier attempt failed, retried' : ev.label,
      at: ev.at,
      tone: isSupplierFailureRetried ? 'neutral' : failed ? 'fault' : done ? 'ok' : 'neutral',
      note: toSentenceCase(ev.note),
    };
  });

  if (opts.supplierReason) {
    const cleanReason = toSentenceCase(opts.supplierReason);
    if (cleanReason && !events.some((event) => event.note === cleanReason)) {
      const last = events.length > 0 ? events[events.length - 1] : undefined;
      events.push({
        label: isDelivered ? 'Supplier attempt failed, retried' : 'Supplier rejected the order',
        at: last?.at ?? opts.deliveredAt,
        tone: isDelivered ? 'neutral' : 'fault',
        note: cleanReason,
      });
    }
  }

  if (isDelivered) {
    const existingDeliveredIdx = events.findIndex((ev) => ev.label.toLowerCase() === 'delivered');
    if (existingDeliveredIdx === -1) {
      events.push({
        label: 'Delivered',
        at: opts.deliveredAt,
        tone: 'ok',
        note: null,
      });
    } else if (existingDeliveredIdx !== events.length - 1) {
      const [deliveredEvent] = events.splice(existingDeliveredIdx, 1);
      if (deliveredEvent) {
        events.push({ ...deliveredEvent, label: 'Delivered', tone: 'ok' });
      }
    }
  }

  return events;
}
