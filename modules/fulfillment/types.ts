/**
 * @file modules/fulfillment/types.ts
 *
 * Fulfillment attempt types.
 *
 * @module Fulfillment
 */

export type FulfillmentMethod = 'file' | 'manual' | 'supplier';
export type FulfillmentAttemptStatus = 'pending' | 'succeeded' | 'failed';

export type FulfillmentAttempt = {
  readonly id: string;
  readonly orderId: string;
  readonly attemptNumber: number;
  readonly method: FulfillmentMethod;
  readonly status: FulfillmentAttemptStatus;
};
