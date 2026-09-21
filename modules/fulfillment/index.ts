/**
 * @file modules/fulfillment/index.ts
 *
 * Fulfillment public API — sandbox attempt recorder.
 *
 * @module Fulfillment
 */

import { FulfillmentError } from '@/lib/errors';
import { randomUUID } from 'node:crypto';
import type { FulfillmentAttempt, FulfillmentMethod } from './types';

export type { FulfillmentAttempt, FulfillmentAttemptStatus, FulfillmentMethod } from './types';

/**
 * Records a sandbox fulfillment attempt. No files are delivered in Phase 0.
 *
 * @param orderId - Order UUID
 * @param method - Fulfillment method
 * @returns Pending sandbox attempt
 * @throws FulfillmentError when orderId is empty
 */
export function queueFulfillment(orderId: string, method: FulfillmentMethod): FulfillmentAttempt {
  if (!orderId) {
    throw new FulfillmentError('ORDER_REQUIRED', 'Fulfillment requires an order id');
  }
  return {
    id: randomUUID(),
    orderId,
    attemptNumber: 1,
    method,
    status: 'pending',
  };
}
