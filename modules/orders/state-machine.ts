/**
 * @file modules/orders/state-machine.ts
 *
 * Four-track order state machine stubs.
 *
 * Each track fails and recovers independently. Transitions are validated
 * against an allow-list so illegal jumps cannot silently succeed.
 *
 * @module Orders
 */

import { ValidationError } from '@/lib/errors';
import type {
  OrderDeliveryStatus,
  OrderFulfillmentStatus,
  OrderFundingStatus,
  OrderPaymentStatus,
  OrderTrack,
} from './types';

const PAYMENT_TRANSITIONS: Readonly<Record<OrderPaymentStatus, readonly OrderPaymentStatus[]>> = {
  not_required: [],
  awaiting: ['pending_verification', 'expired', 'failed'],
  pending_verification: ['verified', 'failed', 'expired'],
  verified: ['refund_pending', 'disputed'],
  failed: ['awaiting'],
  expired: ['awaiting'],
  refund_pending: ['refunded', 'disputed'],
  refunded: [],
  disputed: ['verified', 'refunded'],
};

const FUNDING_TRANSITIONS: Readonly<Record<OrderFundingStatus, readonly OrderFundingStatus[]>> = {
  not_applicable: [],
  reserved: ['debited', 'released'],
  debited: ['reversal_pending'],
  released: [],
  reversal_pending: ['reversed', 'debited'],
  reversed: [],
};

const FULFILLMENT_TRANSITIONS: Readonly<
  Record<OrderFulfillmentStatus, readonly OrderFulfillmentStatus[]>
> = {
  queued: ['manual_pending', 'supplier_pending', 'ready', 'canceled', 'failed'],
  manual_pending: ['ready', 'failed', 'canceled'],
  supplier_pending: ['outcome_unknown', 'ready', 'failed', 'canceled'],
  outcome_unknown: ['ready', 'failed', 'manual_pending'],
  ready: [],
  failed: ['queued'],
  canceled: [],
};

const DELIVERY_TRANSITIONS: Readonly<Record<OrderDeliveryStatus, readonly OrderDeliveryStatus[]>> = {
  not_ready: ['queued'],
  queued: ['sending'],
  sending: ['sent', 'retry_pending', 'unreachable', 'review_required'],
  sent: [],
  retry_pending: ['queued', 'review_required'],
  unreachable: ['queued', 'review_required'],
  review_required: ['queued'],
};

function assertAllowed<T extends string>(
  track: OrderTrack,
  fromStatus: T,
  toStatus: T,
  allowed: readonly T[],
): void {
  if (!allowed.includes(toStatus)) {
    throw new ValidationError(
      'ILLEGAL_ORDER_TRANSITION',
      `Illegal ${track} transition from ${fromStatus} to ${toStatus}`,
    );
  }
}

/**
 * Transitions payment status if the jump is allowed.
 *
 * @param fromStatus - Current payment status
 * @param toStatus - Requested payment status
 * @returns The new status
 * @throws ValidationError on an illegal transition
 */
export function transitionPayment(
  fromStatus: OrderPaymentStatus,
  toStatus: OrderPaymentStatus,
): OrderPaymentStatus {
  assertAllowed('payment', fromStatus, toStatus, PAYMENT_TRANSITIONS[fromStatus]);
  return toStatus;
}

/**
 * Transitions funding status if the jump is allowed.
 *
 * @param fromStatus - Current funding status
 * @param toStatus - Requested funding status
 * @returns The new status
 */
export function transitionFunding(
  fromStatus: OrderFundingStatus,
  toStatus: OrderFundingStatus,
): OrderFundingStatus {
  assertAllowed('funding', fromStatus, toStatus, FUNDING_TRANSITIONS[fromStatus]);
  return toStatus;
}

/**
 * Transitions fulfillment status if the jump is allowed.
 *
 * @param fromStatus - Current fulfillment status
 * @param toStatus - Requested fulfillment status
 * @returns The new status
 */
export function transitionFulfillment(
  fromStatus: OrderFulfillmentStatus,
  toStatus: OrderFulfillmentStatus,
): OrderFulfillmentStatus {
  assertAllowed('fulfillment', fromStatus, toStatus, FULFILLMENT_TRANSITIONS[fromStatus]);
  return toStatus;
}

/**
 * Transitions delivery status if the jump is allowed.
 *
 * @param fromStatus - Current delivery status
 * @param toStatus - Requested delivery status
 * @returns The new status
 */
export function transitionDelivery(
  fromStatus: OrderDeliveryStatus,
  toStatus: OrderDeliveryStatus,
): OrderDeliveryStatus {
  assertAllowed('delivery', fromStatus, toStatus, DELIVERY_TRANSITIONS[fromStatus]);
  return toStatus;
}
