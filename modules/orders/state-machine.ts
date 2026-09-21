/**
 * @file modules/orders/state-machine.ts
 *
 * Order state transitions for all four independent tracks:
 * - payment_status: how the customer pays
 * - funding_status: reseller wallet reservation
 * - fulfillment_status: preparing the product
 * - delivery_status: sending to the customer via Telegram
 *
 * Each track transitions independently.
 * A transition is only valid if the current status allows it.
 * Invalid transitions throw an AppError — never silently ignored.
 *
 * INVARIANT: State transitions are always recorded in order_events (append-only).
 */

import { AppError } from '@/lib/errors';
import type { DbClient } from '@/lib/supabase/query';
import type {
  DeliveryStatus,
  FulfillmentStatus,
  FundingStatus,
  OrderTrack,
  PaymentStatus,
  RecordTransitionOptions,
} from './types';

const PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  not_required: [],
  awaiting: ['pending_verification', 'expired', 'failed'],
  pending_verification: ['verified', 'failed', 'expired'],
  verified: ['refund_pending', 'disputed'],
  failed: ['awaiting', 'verified'],
  expired: ['awaiting'],
  refund_pending: ['refunded', 'disputed'],
  refunded: [],
  disputed: ['verified', 'refunded'],
};

const FUNDING_TRANSITIONS: Readonly<Record<FundingStatus, readonly FundingStatus[]>> = {
  not_applicable: [],
  reserved: ['debited', 'released'],
  debited: ['reversal_pending'],
  released: [],
  reversal_pending: ['reversed', 'debited'],
  reversed: [],
};

const FULFILLMENT_TRANSITIONS: Readonly<Record<FulfillmentStatus, readonly FulfillmentStatus[]>> = {
  queued: ['manual_pending', 'supplier_pending', 'ready', 'canceled', 'failed'],
  manual_pending: ['ready', 'failed', 'canceled'],
  supplier_pending: ['outcome_unknown', 'ready', 'failed', 'canceled'],
  outcome_unknown: ['ready', 'failed', 'manual_pending', 'supplier_pending'],
  ready: [],
  failed: ['queued'],
  canceled: [],
};

const DELIVERY_TRANSITIONS: Readonly<Record<DeliveryStatus, readonly DeliveryStatus[]>> = {
  not_ready: ['queued'],
  queued: ['sending'],
  sending: ['sent', 'retry_pending', 'unreachable', 'review_required'],
  sent: [],
  retry_pending: ['queued', 'review_required'],
  unreachable: ['queued', 'review_required'],
  review_required: ['queued'],
};

const ORDER_STATUS_COLUMNS: Record<OrderTrack, string> = {
  payment: 'payment_status',
  funding: 'funding_status',
  fulfillment: 'fulfillment_status',
  delivery: 'delivery_status',
};

function includesStatus(allowed: readonly string[] | undefined, toStatus: string): boolean {
  return allowed !== undefined && allowed.includes(toStatus);
}

/**
 * Returns whether a payment transition is allowed.
 */
export function canTransitionPayment(from: string, to: string): boolean {
  return includesStatus(PAYMENT_TRANSITIONS[from as PaymentStatus], to);
}

/**
 * Returns whether a funding transition is allowed.
 */
export function canTransitionFunding(from: string, to: string): boolean {
  return includesStatus(FUNDING_TRANSITIONS[from as FundingStatus], to);
}

/**
 * Returns whether a fulfillment transition is allowed.
 */
export function canTransitionFulfillment(from: string, to: string): boolean {
  return includesStatus(FULFILLMENT_TRANSITIONS[from as FulfillmentStatus], to);
}

/**
 * Returns whether a delivery transition is allowed.
 */
export function canTransitionDelivery(from: string, to: string): boolean {
  return includesStatus(DELIVERY_TRANSITIONS[from as DeliveryStatus], to);
}

function canTransition(track: OrderTrack, fromStatus: string, toStatus: string): boolean {
  if (track === 'payment') {
    return canTransitionPayment(fromStatus, toStatus);
  }
  if (track === 'funding') {
    return canTransitionFunding(fromStatus, toStatus);
  }
  if (track === 'fulfillment') {
    return canTransitionFulfillment(fromStatus, toStatus);
  }
  return canTransitionDelivery(fromStatus, toStatus);
}

function assertAllowed(track: OrderTrack, fromStatus: string, toStatus: string): void {
  if (!canTransition(track, fromStatus, toStatus)) {
    throw new AppError(
      'ILLEGAL_ORDER_TRANSITION',
      `Illegal ${track} transition from ${fromStatus} to ${toStatus}`,
      400,
    );
  }
}

/**
 * Transitions payment status if the jump is allowed.
 */
export function transitionPayment(fromStatus: PaymentStatus, toStatus: PaymentStatus): PaymentStatus {
  assertAllowed('payment', fromStatus, toStatus);
  return toStatus;
}

/**
 * Transitions funding status if the jump is allowed.
 */
export function transitionFunding(fromStatus: FundingStatus, toStatus: FundingStatus): FundingStatus {
  assertAllowed('funding', fromStatus, toStatus);
  return toStatus;
}

/**
 * Transitions fulfillment status if the jump is allowed.
 */
export function transitionFulfillment(
  fromStatus: FulfillmentStatus,
  toStatus: FulfillmentStatus,
): FulfillmentStatus {
  assertAllowed('fulfillment', fromStatus, toStatus);
  return toStatus;
}

/**
 * Transitions delivery status if the jump is allowed.
 */
export function transitionDelivery(fromStatus: DeliveryStatus, toStatus: DeliveryStatus): DeliveryStatus {
  assertAllowed('delivery', fromStatus, toStatus);
  return toStatus;
}

/**
 * Validates a transition, appends an order_events row, and updates the order status column.
 *
 * @param supabase - Database client
 * @param orderId - Order UUID
 * @param track - Independent status track
 * @param fromStatus - Current status
 * @param toStatus - Requested status
 * @param options - Optional actor, trigger, and note
 */
export async function recordTransition(
  supabase: DbClient,
  orderId: string,
  track: OrderTrack,
  fromStatus: string,
  toStatus: string,
  options?: RecordTransitionOptions,
): Promise<void> {
  assertAllowed(track, fromStatus, toStatus);
  const { error: eventError } = await supabase.from('order_events').insert({
    order_id: orderId,
    track,
    from_status: fromStatus,
    to_status: toStatus,
    actor_id: options?.actorId ?? null,
    trigger: options?.trigger ?? 'api',
    note: options?.note ?? null,
  });
  if (eventError) {
    throw new AppError('ORDER_EVENT_WRITE_FAILED', eventError.message, 500);
  }
  const column = ORDER_STATUS_COLUMNS[track];
  const { error: updateError } = await supabase
    .from('orders')
    .update({ [column]: toStatus, updated_at: new Date().toISOString() })
    .eq('id', orderId);
  if (updateError) {
    throw new AppError('ORDER_UPDATE_FAILED', updateError.message, 500);
  }
}

/**
 * Records the four initial track statuses without validating a from→to jump.
 *
 * @param supabase - Database client
 * @param orderId - Order UUID
 * @param statuses - Initial statuses
 * @param trigger - Event trigger
 */
export async function recordInitialStatuses(
  supabase: DbClient,
  orderId: string,
  statuses: {
    readonly payment: PaymentStatus;
    readonly funding: FundingStatus;
    readonly fulfillment: FulfillmentStatus;
    readonly delivery: DeliveryStatus;
  },
  trigger: 'webhook' | 'worker' | 'manual' | 'api' = 'api',
): Promise<void> {
  const tracks: ReadonlyArray<{ track: OrderTrack; toStatus: string }> = [
    { track: 'payment', toStatus: statuses.payment },
    { track: 'funding', toStatus: statuses.funding },
    { track: 'fulfillment', toStatus: statuses.fulfillment },
    { track: 'delivery', toStatus: statuses.delivery },
  ];
  for (const item of tracks) {
    const { error } = await supabase.from('order_events').insert({
      order_id: orderId,
      track: item.track,
      from_status: null,
      to_status: item.toStatus,
      trigger,
      note: 'initial',
    });
    if (error) {
      throw new AppError('ORDER_EVENT_WRITE_FAILED', error.message, 500);
    }
  }
}
