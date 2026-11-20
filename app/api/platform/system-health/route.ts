/**
 * @file app/api/platform/system-health/route.ts
 *
 * Owner-only System health API:
 * - GET returns supplier balance trends, cron schedules, bot webhook health,
 *   active/failed job queues, error log, and launch readiness checks.
 * - POST triggers a specific scheduled maintenance job on demand within bounded limits.
 */

import { z } from 'zod';
import { asDbClient, requireOwner } from '@/lib/auth/session';
import { CRON_BATCH_LIMITS, CRON_TIME_BUDGET_MS } from '@/lib/cron-budget';
import { recordCronHeartbeat } from '@/lib/cron-heartbeat';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { runBotHealthChecks } from '@/modules/bots';
import { processQueuedFulfillments, reconcileUnknownSupplierOrders } from '@/modules/fulfillment';
import { processDueBroadcasts } from '@/modules/platform/growth';
import { readSystemHealth } from '@/modules/platform/system-health';
import { syncDueSuppliers } from '@/modules/supplier';
import { pollPendingSupplierOrders } from '@/modules/supplier/poll';
import { expirePendingTopups } from '@/modules/topups';

export const dynamic = 'force-dynamic';

const TriggerSchema = z.object({
  job: z.enum(['fulfillment', 'supplier_reconcile', 'supplier_sync', 'bot_health', 'broadcasts']),
});

export async function GET(): Promise<Response> {
  try {
    const session = await requireOwner();
    const data = await readSystemHealth(asDbClient(session.admin));
    return jsonSuccess(data, 200, { cache: 'none' });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    await assertRateLimit(`system-health:${session.user.id}`, 15, 60_000);
    const parsed = TriggerSchema.parse(await readJsonBody(req));
    const db = asDbClient(session.admin);

    if (parsed.job === 'fulfillment') {
      const processed = await processQueuedFulfillments(db, {
        batchLimit: CRON_BATCH_LIMITS.fulfillmentQueuedOrders,
        readyBatchLimit: CRON_BATCH_LIMITS.fulfillmentReadyOrders,
        timeBudgetMs: CRON_TIME_BUDGET_MS - 4_000,
      });
      const expiredTopups = await expirePendingTopups(db);
      await recordCronHeartbeat(
        db,
        'cron.fulfillment',
        {
          processed: processed.processed,
          failed: processed.failed,
          expiredTopups,
          durationMs: processed.durationMs,
        },
        'Manual run from System health',
        session.user.id,
      );
    } else if (parsed.job === 'supplier_reconcile') {
      const reconciled = await reconcileUnknownSupplierOrders(db, {
        batchLimit: CRON_BATCH_LIMITS.reconcileUnknownOrders,
        timeBudgetMs: 8_000,
      });
      const polled = await pollPendingSupplierOrders(db, {
        batchLimit: CRON_BATCH_LIMITS.reconcilePollOrders,
        timeBudgetMs: 6_000,
      });
      const synced = await syncDueSuppliers(db, 30 * 60 * 1000, {
        maxSuppliers: CRON_BATCH_LIMITS.reconcilePiggybackSuppliers,
        timeBudgetMs: 6_000,
      });
      await recordCronHeartbeat(
        db,
        'cron.supplier_reconcile',
        {
          reconciled: reconciled.reconciled,
          polled: polled.polled,
          catalogSynced: synced.results.length,
        },
        'Manual run from System health',
        session.user.id,
      );
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
          'Manual supplier reconcile sync pass',
          session.user.id,
        );
      }
    } else if (parsed.job === 'supplier_sync') {
      const synced = await syncDueSuppliers(db, 0, {
        maxSuppliers: CRON_BATCH_LIMITS.supplierSyncMaxSuppliers,
        timeBudgetMs: CRON_TIME_BUDGET_MS - 2_000,
      });
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
        'Manual sync from System health',
        session.user.id,
      );
    } else if (parsed.job === 'broadcasts') {
      const result = await processDueBroadcasts(db, new Date(), undefined, {
        maxJobs: CRON_BATCH_LIMITS.broadcastJobs,
        maxRecipients: CRON_BATCH_LIMITS.broadcastRecipients,
        timeBudgetMs: CRON_TIME_BUDGET_MS - 2_000,
      });
      await recordCronHeartbeat(
        db,
        'cron.broadcasts',
        { processed: result.processed, truncated: result.truncated, durationMs: result.durationMs },
        'Manual broadcast run from System health',
        session.user.id,
      );
    } else {
      const bots = await runBotHealthChecks(db, {
        batchLimit: CRON_BATCH_LIMITS.botHealthChecks,
        timeBudgetMs: CRON_TIME_BUDGET_MS - 2_000,
      });
      await recordCronHeartbeat(
        db,
        'cron.bot_health',
        { checked: bots.checked, errors: bots.errors, durationMs: bots.durationMs },
        'Manual check from System health',
        session.user.id,
      );
    }

    const health = await readSystemHealth(db);
    return jsonSuccess({ triggered: parsed.job, health }, 200, { cache: 'none' });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
