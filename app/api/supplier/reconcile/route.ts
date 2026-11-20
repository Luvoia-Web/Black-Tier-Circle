/**
 * @file app/api/supplier/reconcile/route.ts
 *
 * Supplier reconciliation job.
 * Polls supplier for status of outcome_unknown orders.
 * Called by an external cron (GET or POST) or by an owner from the dashboard.
 * Auth: Authorization Bearer CRON_SECRET, ?secret=, or owner session.
 *
 * INVARIANT: Never release reservation on 'unknown' status — may still complete.
 *
 * @module Api
 */

import { NextRequest } from 'next/server';
import { asDbClient } from '@/lib/auth/session';
import { authorizeCronOrOwner } from '@/lib/cron-auth';
import { recordCronHeartbeat } from '@/lib/cron-heartbeat';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { reconcileUnknownSupplierOrders } from '@/modules/fulfillment';
import { syncDueSuppliers } from '@/modules/supplier';
import { pollPendingSupplierOrders } from '@/modules/supplier/poll';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const authError = await authorizeCronOrOwner(req);
    if (authError) {
      return authError;
    }
    const db = asDbClient(createAdminSupabaseClient());
    const result = await reconcileUnknownSupplierOrders(db);
    const polled = await pollPendingSupplierOrders(db);
    let catalogSync: readonly unknown[] = [];
    try {
      const synced = await syncDueSuppliers(db, 30 * 60 * 1000);
      catalogSync = synced.results;
      if (synced.results.length > 0) {
        await recordCronHeartbeat(
          db,
          'cron.supplier_sync',
          {
            suppliers: synced.results.length,
            ok: synced.results.filter((row) => row.ok).length,
            failed: synced.results.filter((row) => !row.ok).length,
          },
          'Supplier catalog sync (scheduled reconcile pass)',
        );
      }
    } catch {
      // Do not fail order reconciliation if catalog sync hits a transient error.
    }
    await recordCronHeartbeat(
      db,
      'cron.supplier_reconcile',
      {
        reconciled: result.reconciled,
        polled: polled.polled,
        catalogSynced: catalogSync.length,
      },
      'Supplier order reconciliation cron',
    );
    return jsonSuccess({ ...result, supplierPoll: polled, catalogSync });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return POST(req);
}
