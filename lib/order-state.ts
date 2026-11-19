/**
 * @file lib/order-state.ts
 *
 * Single source of truth for order status classification across Overview,
 * Today attention list, Orders table & chips, and the sidebar nav badge.
 *
 * INVARIANT: An order with delivery_status === 'sent' is delivered and NEVER
 * appears as failed or in Needs attention, even if an earlier fulfillment
 * attempt had a failed status before delivery succeeded.
 */

export type OrderTracks = {
  readonly paymentStatus: string;
  readonly fulfillmentStatus: string;
  readonly deliveryStatus: string;
};

/** Delivery statuses that are NOT already delivered. Safe for .in('delivery_status', ...). */
export const NOT_DELIVERED_STATUSES = [
  'not_ready',
  'queued',
  'sending',
  'retry_pending',
  'unreachable',
  'review_required',
] as const;

export function isOrderDelivered(tracks: OrderTracks): boolean {
  return tracks.deliveryStatus === 'sent';
}

export function isOrderCanceled(tracks: OrderTracks): boolean {
  return tracks.fulfillmentStatus === 'canceled' || tracks.paymentStatus === 'refunded';
}

export function isOrderFailed(tracks: OrderTracks): boolean {
  if (isOrderDelivered(tracks) || isOrderCanceled(tracks)) {
    return false;
  }
  return (
    tracks.fulfillmentStatus === 'failed' ||
    tracks.paymentStatus === 'failed' ||
    tracks.deliveryStatus === 'unreachable'
  );
}

export function orderNeedsAttention(tracks: OrderTracks): boolean {
  if (isOrderDelivered(tracks) || isOrderCanceled(tracks)) {
    return false;
  }
  if (isOrderFailed(tracks)) {
    return true;
  }
  return (
    tracks.paymentStatus === 'disputed' ||
    tracks.fulfillmentStatus === 'manual_pending' ||
    tracks.fulfillmentStatus === 'outcome_unknown' ||
    tracks.deliveryStatus === 'retry_pending' ||
    tracks.deliveryStatus === 'review_required'
  );
}

export function orderCanRetry(tracks: OrderTracks): boolean {
  if (isOrderDelivered(tracks) || isOrderCanceled(tracks)) {
    return false;
  }
  return (
    tracks.fulfillmentStatus === 'failed' ||
    tracks.deliveryStatus === 'retry_pending' ||
    tracks.deliveryStatus === 'unreachable'
  );
}

export function orderDisplayStatus(tracks: OrderTracks): {
  readonly label: string;
  readonly tone: 'ok' | 'fault' | 'warn' | 'neutral' | 'info';
} {
  if (tracks.deliveryStatus === 'sent') {
    return { label: 'Delivered', tone: 'ok' };
  }
  if (tracks.paymentStatus === 'refunded') {
    return { label: 'Refunded', tone: 'neutral' };
  }
  if (tracks.fulfillmentStatus === 'canceled') {
    return { label: 'Cancelled', tone: 'neutral' };
  }
  if (tracks.paymentStatus === 'expired') {
    return { label: 'Expired', tone: 'warn' };
  }
  if (
    tracks.fulfillmentStatus === 'failed' ||
    tracks.paymentStatus === 'failed' ||
    tracks.deliveryStatus === 'unreachable'
  ) {
    return {
      label: tracks.fulfillmentStatus === 'failed' ? 'Failed at supplier' : 'Failed',
      tone: 'fault',
    };
  }
  if (
    tracks.fulfillmentStatus === 'supplier_pending' ||
    tracks.fulfillmentStatus === 'processing' ||
    tracks.fulfillmentStatus === 'queued'
  ) {
    if (tracks.paymentStatus === 'awaiting' || tracks.paymentStatus === 'pending_verification') {
      return { label: 'Awaiting payment', tone: 'warn' };
    }
    return { label: 'Activating', tone: 'info' };
  }
  if (tracks.paymentStatus === 'awaiting' || tracks.paymentStatus === 'pending_verification') {
    return { label: 'Awaiting payment', tone: 'warn' };
  }
  return { label: 'In progress', tone: 'neutral' };
}
