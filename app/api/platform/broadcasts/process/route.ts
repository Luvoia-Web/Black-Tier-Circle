/**
 * @file app/api/platform/broadcasts/process/route.ts
 *
 * Processes due scheduled broadcasts. Cron secret or an owner session.
 */

import { NextRequest } from 'next/server';
import { asDbClient } from '@/lib/auth/session';
import { authorizeCronOrOwner } from '@/lib/cron-auth';
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
    const result = await processDueBroadcasts(db);
    return jsonSuccess(result);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
