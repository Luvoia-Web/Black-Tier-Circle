/**
 * @file app/api/fulfillment/process/route.ts
 *
 * Processes queued fulfillments. Called by an external cron (GET or POST)
 * or by an owner from the dashboard.
 * Auth: Authorization Bearer CRON_SECRET, ?secret=, or owner session.
 *
 * @module Api
 */

import { NextRequest } from 'next/server';
import { asDbClient } from '@/lib/auth/session';
import { authorizeCronOrOwner } from '@/lib/cron-auth';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { processQueuedFulfillments } from '@/modules/fulfillment';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const authError = await authorizeCronOrOwner(req);
    if (authError) {
      return authError;
    }
    const result = await processQueuedFulfillments(asDbClient(createAdminSupabaseClient()));
    return jsonSuccess(result);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return POST(req);
}
