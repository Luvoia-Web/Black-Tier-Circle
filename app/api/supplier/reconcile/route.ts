/**
 * @file app/api/supplier/reconcile/route.ts
 *
 * Supplier reconciliation job in bounded batches within a 20 s time budget.
 * Polls supplier for status of outcome_unknown and pending activation orders,
 * and piggybacks at most 1 due supplier catalog sync only if ample budget remains.
 * Auth: Authorization Bearer CRON_SECRET (constant-time), ?secret=, or owner session.
 *
 * INVARIANT: Never release reservation on 'unknown' status — may still complete.
 *
 * @module Api
 */

import { NextRequest } from 'next/server';
import { asDbClient } from '@/lib/auth/session';
import { CRON_BATCH_LIMITS, CRON_TIME_BUDGET_MS, createCronBudget } from '@/lib/cron-budget';
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
    const budget = createCronBudget(CRON_TIME_BUDGET_MS);
    const db = asDbClient(createAdminSupabaseClient());
    const result = await reconcileUnknownSupplierOrders(db, {
      batchLimit: CRON_BATCH_LIMITS.reconcileUnknownOrders,
      timeBudgetMs: 8_000,
    });
    const polled = budget.hasTime(1_500)
      ? await pollPendingSupplierOrders(db, {
          batchLimit: CRON_BATCH_LIMITS.reconcilePollOrders,
          timeBudgetMs: Math.max(2_000, Math.min(8_000, budget.remainingMs() - 2_000)),
        })
      : { polled: 0, delivered: 0, failed: 0, stillPending: 0, truncated: true, durationMs: 0 };

    let catalogSync: readonly unknown[] = [];
    let catalogTruncated = false;
    if (budget.hasTime(CRON_BATCH_LIMITS.reconcilePiggybackMinRemainingMs)) {
      try {
        const synced = await syncDueSuppliers(db, 30 * 60 * 1000, {
          maxSuppliers: CRON_BATCH_LIMITS.reconcilePiggybackSuppliers,
          timeBudgetMs: Math.max(3_000, budget.remainingMs() - 2_000),
        });
        catalogSync = synced.results;
        catalogTruncated = synced.truncated;
        if (synced.results.length > 0) {
          const single = synced.results[0];
          await recordCronHeartbeat(
            db,
            'cron.supplier_sync',
            {
              suppliers: synced.results.length,
              ok: synced.results.filter((row) => row.ok).length,
              failed: synced.results.filter((row) => !row.ok).length,
              supplierId: single?.supplierId ?? null,
              supplierName: single?.name ?? null,
              durationMs: synced.durationMs,
            },
            single
              ? `Synced ${single.name} (reconcile pass)`
              : 'Supplier catalog sync (scheduled reconcile pass)',
          );
        }
      } catch {
        // Do not fail order reconciliation if catalog sync hits a transient error.
      }
    }

    const durationMs = budget.elapsedMs();
    const truncated = Boolean(result.truncated || polled.truncated || catalogTruncated);
    await recordCronHeartbeat(
      db,
      'cron.supplier_reconcile',
      {
        reconciled: result.reconciled,
        polled: polled.polled,
        catalogSynced: catalogSync.length,
        truncated,
        durationMs,
      },
      'Supplier order reconciliation cron',
    );
    return jsonSuccess({ ...result, supplierPoll: polled, catalogSync, truncated, durationMs });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return POST(req);
}
