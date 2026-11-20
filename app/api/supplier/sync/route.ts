/**
 * @file app/api/supplier/sync/route.ts
 *
 * Syncs ONE active supplier per call (the one with the oldest last-synced time,
 * or the explicitly requested supplierId) within a strict 20 s time budget so
 * external cron runners (30 s ceiling) never time out.
 * Auth: Authorization: Bearer CRON_SECRET (constant-time), ?secret=, or owner session.
 */

import { NextRequest } from 'next/server';
import { asDbClient } from '@/lib/auth/session';
import { CRON_BATCH_LIMITS, CRON_TIME_BUDGET_MS, createCronBudget } from '@/lib/cron-budget';
import { authorizeCronOrOwner } from '@/lib/cron-auth';
import { recordCronHeartbeat } from '@/lib/cron-heartbeat';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { safeSupplierSyncMessage } from '@/lib/supplier-errors';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { listSuppliers, pickOldestSupplier, syncSupplierProducts } from '@/modules/supplier';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const authError = await authorizeCronOrOwner(req);
    if (authError) {
      return authError;
    }
    const budget = createCronBudget(CRON_TIME_BUDGET_MS);
    const db = asDbClient(createAdminSupabaseClient());
    let supplierId: string | undefined = new URL(req.url).searchParams.get('supplierId') ?? undefined;
    if (req.headers.get('content-type')?.includes('application/json')) {
      try {
        const body = (await readJsonBody(req)) as { supplierId?: string };
        if (typeof body.supplierId === 'string' && body.supplierId.trim().length > 0) {
          supplierId = body.supplierId.trim();
        }
      } catch {
        // Cron callers often send Content-Type: application/json with an empty body.
      }
    }

    const suppliers = await listSuppliers(db);
    const active = suppliers.filter(
      (supplier) =>
        (supplier.status === 'active' || supplier.status === 'connected') && supplier.hasApiKey,
    );
    const picked = supplierId
      ? active.find((supplier) => supplier.id === supplierId) ?? null
      : pickOldestSupplier(active).supplier;

    const results: Array<{
      readonly supplierId: string;
      readonly name: string;
      readonly ok: boolean;
      readonly synced: number;
      readonly newProducts: number;
      readonly updatedProducts: number;
      readonly outOfStock: number;
      readonly stockChanged: number;
      readonly repriced: number;
      readonly autoPaused: number;
      readonly truncated: boolean;
      readonly errors: readonly string[];
      readonly durationMs: number;
    }> = [];

    if (picked) {
      const started = Date.now();
      try {
        const summary = await syncSupplierProducts(db, picked.id, {
          timeBudgetMs: Math.max(2_000, budget.remainingMs() - 1_000),
          maxUpdates: CRON_BATCH_LIMITS.supplierSyncMaxUpdates,
        });
        results.push({
          supplierId: picked.id,
          name: picked.name,
          ok: summary.errors.length === 0,
          synced: summary.synced,
          newProducts: summary.newProducts,
          updatedProducts: summary.updatedProducts,
          outOfStock: summary.outOfStock,
          stockChanged: summary.stockChanged,
          repriced: summary.repriced,
          autoPaused: summary.autoPaused,
          truncated: summary.truncated ?? false,
          errors: summary.errors,
          durationMs: Date.now() - started,
        });
      } catch (error: unknown) {
        const message = safeSupplierSyncMessage(error);
        try {
          await db
            .from('suppliers')
            .update({
              last_sync_error: message,
              updated_at: new Date().toISOString(),
            })
            .eq('id', picked.id);
        } catch {
          // Keep returning a clean JSON status even if the error stamp fails.
        }
        results.push({
          supplierId: picked.id,
          name: picked.name,
          ok: false,
          synced: 0,
          newProducts: 0,
          updatedProducts: 0,
          outOfStock: 0,
          stockChanged: 0,
          repriced: 0,
          autoPaused: 0,
          truncated: false,
          errors: [message],
          durationMs: Date.now() - started,
        });
      }
    }

    const totalDurationMs = budget.elapsedMs();
    const single = results[0] ?? null;

    await recordCronHeartbeat(
      db,
      'cron.supplier_sync',
      {
        suppliers: results.length,
        ok: results.filter((row) => row.ok).length,
        failed: results.filter((row) => !row.ok).length,
        supplierId: single?.supplierId ?? null,
        supplierName: single?.name ?? null,
        durationMs: totalDurationMs,
        truncated: single?.truncated ?? false,
      },
      single ? `Synced ${single.name}` : 'Supplier catalog sync (no active suppliers)',
    );

    return jsonSuccess({
      supplier: single,
      supplierId: single?.supplierId ?? null,
      supplierName: single?.name ?? null,
      durationMs: totalDurationMs,
      totalActiveSuppliers: active.length,
      remainingSuppliers: Math.max(0, active.length - results.length),
      truncated: single?.truncated ?? false,
      results,
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return POST(req);
}
