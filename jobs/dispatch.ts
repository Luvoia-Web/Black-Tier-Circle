/**
 * @file jobs/dispatch.ts
 *
 * Job dispatcher stub over Supabase Queues (pgmq) in later phases.
 *
 * @module Jobs
 */

import { logger } from '@/lib/logger';

export type JobName = 'fulfill_order' | 'deliver_order' | 'verify_payment';

export type JobPayload = {
  readonly name: JobName;
  readonly orderId: string;
  readonly idempotencyKey: string;
};

/**
 * Enqueues a sandbox job. Phase 0 logs instead of writing to pgmq.
 *
 * @param payload - Job name and order correlation
 * @returns Promise that resolves after the stub enqueue
 */
export async function dispatchJob(payload: JobPayload): Promise<void> {
  logger.info('sandbox job dispatched', {
    name: payload.name,
    orderId: payload.orderId,
  });
}
