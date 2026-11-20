/**
 * @file app/api/platform/broadcasts/process/route.ts
 *
 * Processes due scheduled broadcasts in bounded batches within a 20 s time budget.
 * Auth: Authorization Bearer CRON_SECRET (constant-time), ?secret=, or owner session.
 */

import { NextRequest } from 'next/server';
import { asDbClient } from '@/lib/auth/session';
import { CRON_BATCH_LIMITS, CRON_TIME_BUDGET_MS } from '@/lib/cron-budget';
import { authorizeCronOrOwner } from '@/lib/cron-auth';
import { recordCronHeartbeat } from '@/lib/cron-heartbeat';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { processDueBroadcasts } from '@/modules/platform/growth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const authError = await authorizeCronOrOwner(req);
    if (authError) {
      return authError;
    }
    const db = asDbClient(createAdminSupabaseClient());
    const result = await processDueBroadcasts(db, new Date(), undefined, {
      maxJobs: CRON_BATCH_LIMITS.broadcastJobs,
      maxRecipients: CRON_BATCH_LIMITS.broadcastRecipients,
      timeBudgetMs: CRON_TIME_BUDGET_MS - 2_000,
    });
    await recordCronHeartbeat(
      db,
      'cron.broadcasts',
      {
        processed: result.processed,
        truncated: result.truncated,
        durationMs: result.durationMs,
      },
      'Scheduled broadcasts cron',
    );
    return jsonSuccess(result);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return POST(req);
}
