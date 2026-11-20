/**
 * @file lib/cron-heartbeat.ts
 *
 * Best-effort audit_log heartbeat for background cron jobs and manual triggers.
 */

import type { DbClient } from '@/lib/supabase/query';

export type CronAction =
  | 'cron.fulfillment'
  | 'cron.supplier_reconcile'
  | 'cron.supplier_sync'
  | 'cron.bot_health'
  | 'cron.broadcasts';

/**
 * Records a lightweight cron execution marker in audit_log.
 * Never throws so unit tests or transient DB glitches never fail a cron run.
 */
export async function recordCronHeartbeat(
  db: DbClient,
  action: CronAction,
  afterVal: Record<string, unknown>,
  reason: string,
  actorId: string | null = null,
): Promise<void> {
  try {
    if (typeof (db as { from?: unknown }).from !== 'function') {
      return;
    }
    const table = db.from('audit_log') as unknown as {
      insert?: (row: Record<string, unknown>) => Promise<unknown>;
    };
    if (!table || typeof table.insert !== 'function') {
      return;
    }
    await table.insert({
      actor_id: actorId,
      tenant_id: null,
      action,
      target_type: 'cron',
      target_id: null,
      before_val: null,
      after_val: afterVal,
      reason,
    });
  } catch {
    // Heartbeats are best-effort; never fail a cron endpoint on telemetry writes.
  }
}
