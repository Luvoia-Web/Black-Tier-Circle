/**
 * @file app/api/bots/health/route.ts
 *
 * Checks all connected bots. Called by an external cron (GET or POST)
 * or by an owner from the dashboard.
 * Auth: Authorization Bearer CRON_SECRET, ?secret=, or owner session.
 *
 * @module Api
 */

import { NextRequest } from 'next/server';
import { asDbClient } from '@/lib/auth/session';
import { authorizeCronOrOwner } from '@/lib/cron-auth';
import { recordCronHeartbeat } from '@/lib/cron-heartbeat';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { runBotHealthChecks } from '@/modules/bots';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const authError = await authorizeCronOrOwner(req);
    if (authError) {
      return authError;
    }
    const db = asDbClient(createAdminSupabaseClient());
    const result = await runBotHealthChecks(db);
    await recordCronHeartbeat(
      db,
      'cron.bot_health',
      { checked: result.checked, errors: result.errors },
      'Bot webhook health check',
    );
    return jsonSuccess(result);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return POST(req);
}
