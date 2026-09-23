/**
 * @file lib/schedule-after.ts
 *
 * Runs work after the HTTP response when the runtime supports it.
 * Next.js 14 does not export after(), so callers must await in that case
 * or the serverless isolate freezes and the update is lost.
 */

import { logger } from '@/lib/logger';

type AfterFn = (task: () => Promise<void> | void) => void;

/**
 * Schedules work with Next.js after() when that export exists.
 *
 * @returns true when the caller can respond immediately
 */
export async function scheduleAfterResponse(work: () => Promise<void>): Promise<boolean> {
  try {
    const server = (await import('next/server')) as { after?: AfterFn };
    if (typeof server.after === 'function') {
      server.after(() =>
        work().catch((error: unknown) => {
          logger.error('deferred webhook failed', {
            message: error instanceof Error ? error.message : 'unknown',
          });
        }),
      );
      return true;
    }
  } catch (error: unknown) {
    logger.info('after() unavailable', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
  return false;
}
