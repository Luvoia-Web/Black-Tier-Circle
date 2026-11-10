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
import { logger } from '@/lib/logger';
import { qualifyPendingReferrals } from '@/modules/referrals/store';
import { deliverReferralNotice } from '@/modules/referrals/notify';
import { friendJoinedText, qualifiedText } from '@/modules/referrals/screens';
import { getStoreConfig } from '@/modules/store-config';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const authError = await authorizeCronOrOwner(req);
    if (authError) {
      return authError;
    }
    const db = asDbClient(createAdminSupabaseClient());
    const result = await processQueuedFulfillments(db);
    try {
      await qualifyPendingReferrals(db, new Date(), {
        qualified: async (input) => {
          const config = (await getStoreConfig(db, input.tenantId)).config.referrals;
          await deliverReferralNotice(db, input.referrerCustomerId, qualifiedText(config.templates.qualified, input.points));
        },
        joined: async (input) => {
          const config = (await getStoreConfig(db, input.tenantId)).config.referrals;
          await deliverReferralNotice(db, input.referrerCustomerId, friendJoinedText(config.templates.friendJoined, input.name));
        },
      });
    } catch (error: unknown) {
      logger.error('referral sweep failed', { message: error instanceof Error ? error.message : 'unknown' });
    }
    return jsonSuccess(result);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return POST(req);
}
