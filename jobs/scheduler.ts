/**
 * @file jobs/scheduler.ts
 *
 * Cron/scheduler stub. Protected by CRON_SECRET in later phases.
 *
 * @module Jobs
 */

import { logger } from '@/lib/logger';

/**
 * Runs due sandbox jobs. No-op until handlers exist.
 *
 * @returns Promise that resolves when the stub sweep finishes
 */
export async function runScheduledJobs(): Promise<void> {
  logger.info('scheduler tick — no handlers registered in Phase 0');
}
