/**
 * @file app/api/supplier/reconcile/route.ts
 *
 * Supplier reconciliation cron job.
 * Polls supplier for status of outcome_unknown orders.
 * Called every 15 minutes by Vercel cron.
 *
 * Auth: CRON_SECRET bearer token.
 *
 * INVARIANT: Never release reservation on 'unknown' status — may still complete.
 *
 * @module Api
 */

import { asDbClient } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { reconcileUnknownSupplierOrders } from '@/modules/fulfillment';

export const dynamic = 'force-dynamic';

function authorizeCron(request: Request): void {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get('authorization');
  if (!expected || header !== `Bearer ${expected}`) {
    throw new AuthError('UNAUTHORIZED', 'Invalid cron secret');
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    authorizeCron(request);
    const result = await reconcileUnknownSupplierOrders(asDbClient(createAdminSupabaseClient()));
    return jsonSuccess(result);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
