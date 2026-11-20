/**
 * @file app/api/platform/system-health/route.ts
 *
 * Owner-only System health API:
 * - GET returns supplier balance trends, cron schedules, bot webhook health,
 *   active/failed job queues, error log, and launch readiness checks.
 * - POST triggers a specific scheduled maintenance job on demand.
 */

import { z } from 'zod';
import { asDbClient, requireOwner } from '@/lib/auth/session';
import { recordCronHeartbeat } from '@/lib/cron-heartbeat';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { runBotHealthChecks } from '@/modules/bots';
import { processQueuedFulfillments, reconcileUnknownSupplierOrders } from '@/modules/fulfillment';
import { readSystemHealth } from '@/modules/platform/system-health';
import { syncDueSuppliers } from '@/modules/supplier';
import { pollPendingSupplierOrders } from '@/modules/supplier/poll';
import { expirePendingTopups } from '@/modules/topups';

export const dynamic = 'force-dynamic';

const TriggerSchema = z.object({
  job: z.enum(['fulfillment', 'supplier_reconcile', 'supplier_sync', 'bot_health']),
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
      const processed = await processQueuedFulfillments(db);
      const expiredTopups = await expirePendingTopups(db);
      await recordCronHeartbeat(
        db,
        'cron.fulfillment',
        { processed: processed.processed, failed: processed.failed, expiredTopups },
        'Manual run from System health',
        session.user.id,
      );
    } else if (parsed.job === 'supplier_reconcile') {
      const reconciled = await reconcileUnknownSupplierOrders(db);
      const polled = await pollPendingSupplierOrders(db);
      const synced = await syncDueSuppliers(db, 30 * 60 * 1000);
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
        await recordCronHeartbeat(
          db,
          'cron.supplier_sync',
          {
            suppliers: synced.results.length,
            ok: synced.results.filter((row) => row.ok).length,
            failed: synced.results.filter((row) => !row.ok).length,
          },
          'Manual supplier reconcile sync pass',
          session.user.id,
        );
      }
    } else if (parsed.job === 'supplier_sync') {
      const synced = await syncDueSuppliers(db, 0);
      await recordCronHeartbeat(
        db,
        'cron.supplier_sync',
        {
          suppliers: synced.results.length,
          ok: synced.results.filter((row) => row.ok).length,
          failed: synced.results.filter((row) => !row.ok).length,
        },
        'Manual sync from System health',
        session.user.id,
      );
    } else {
      const bots = await runBotHealthChecks(db);
      await recordCronHeartbeat(
        db,
        'cron.bot_health',
        { checked: bots.checked, errors: bots.errors },
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
