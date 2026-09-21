/**
 * @file modules/fulfillment/types.ts
 *
 * Fulfillment attempt, delivery attempt, and result types.
 *
 * @module Fulfillment
 */

export type FulfillmentMethod = 'file' | 'manual' | 'supplier';

export type FulfillmentAttemptStatus = 'pending' | 'success' | 'failed';

export type DeliveryAttemptStatus = 'pending' | 'success' | 'failed';

export type DeliveryChannel = 'telegram' | 'api';

export type FulfillmentAttempt = {
  readonly id: string;
  readonly orderId: string;
  readonly attemptNumber: number;
  readonly method: FulfillmentMethod;
  readonly status: FulfillmentAttemptStatus;
  readonly artifactPath: string | null;
  readonly fulfilledBy: string | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly error: string | null;
};

export type DeliveryAttempt = {
  readonly id: string;
  readonly fulfillmentId: string;
  readonly attemptNumber: number;
  readonly channel: DeliveryChannel;
  readonly status: DeliveryAttemptStatus;
  readonly attemptedAt: Date;
  readonly result: string | null;
  readonly error: string | null;
};

export type FulfillmentResult = {
  readonly success: boolean;
  readonly method: FulfillmentMethod;
  readonly fulfillmentAttemptId: string;
  readonly error?: string;
};

export type OrderFulfillmentStatusSnapshot = {
  readonly fulfillment: string;
  readonly delivery: string;
  readonly fulfillmentAttempts: readonly FulfillmentAttempt[];
  readonly deliveryAttempts: readonly DeliveryAttempt[];
};

export type FulfillmentAttemptRow = {
  readonly id: string;
  readonly order_id: string;
  readonly attempt_number: number;
  readonly method: string;
  readonly status: string;
  readonly artifact_path: string | null;
  readonly fulfilled_by: string | null;
  readonly started_at: string;
  readonly completed_at: string | null;
  readonly error: string | null;
};

export type DeliveryAttemptRow = {
  readonly id: string;
  readonly fulfillment_id: string;
  readonly attempt_number: number;
  readonly channel: string;
  readonly status: string;
  readonly attempted_at: string;
  readonly result: string | null;
  readonly error: string | null;
};
