/**
 * @file app/api/fulfillment/process/route.ts
 *
 * POST, internal. Vercel cron processes queued fulfillments.
 * Header: Authorization: Bearer {CRON_SECRET}
 *
 * @module Api
 */

import { asDbClient } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { processQueuedFulfillments } from '@/modules/fulfillment';

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
    const result = await processQueuedFulfillments(asDbClient(createAdminSupabaseClient()));
    return jsonSuccess(result);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
