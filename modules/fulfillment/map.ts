/**
 * @file modules/fulfillment/map.ts
 *
 * Maps fulfillment and delivery attempt rows to domain types.
 *
 * @module Fulfillment
 */

import type {
  DeliveryAttempt,
  DeliveryAttemptRow,
  DeliveryAttemptStatus,
  DeliveryChannel,
  FulfillmentAttempt,
  FulfillmentAttemptRow,
  FulfillmentAttemptStatus,
  FulfillmentMethod,
} from './types';

function asMethod(value: string): FulfillmentMethod {
  if (value === 'file' || value === 'manual' || value === 'supplier') {
    return value;
  }
  return 'manual';
}

function asAttemptStatus(value: string): FulfillmentAttemptStatus {
  if (value === 'pending' || value === 'success' || value === 'failed') {
    return value;
  }
  return 'pending';
}

function asDeliveryStatus(value: string): DeliveryAttemptStatus {
  if (value === 'pending' || value === 'success' || value === 'failed') {
    return value;
  }
  return 'pending';
}

function asChannel(value: string): DeliveryChannel {
  return value === 'api' ? 'api' : 'telegram';
}

/**
 * Maps a fulfillment_attempts row.
 *
 * @param row - Database row
 */
export function mapFulfillmentAttemptRow(row: FulfillmentAttemptRow): FulfillmentAttempt {
  return {
    id: row.id,
    orderId: row.order_id,
    attemptNumber: row.attempt_number,
    method: asMethod(row.method),
    status: asAttemptStatus(row.status),
    artifactPath: row.artifact_path,
    fulfilledBy: row.fulfilled_by,
    startedAt: new Date(row.started_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    error: row.error,
  };
}

/**
 * Maps a delivery_attempts row.
 *
 * @param row - Database row
 */
export function mapDeliveryAttemptRow(row: DeliveryAttemptRow): DeliveryAttempt {
  return {
    id: row.id,
    fulfillmentId: row.fulfillment_id,
    attemptNumber: row.attempt_number,
    channel: asChannel(row.channel),
    status: asDeliveryStatus(row.status),
    attemptedAt: new Date(row.attempted_at),
    result: row.result,
    error: row.error,
  };
}
