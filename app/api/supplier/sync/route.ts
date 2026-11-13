/**
 * @file app/api/supplier/sync/route.ts
 *
 * Syncs active suppliers. Cron secret or an owner session.
 * One supplier failing does not stop the others.
 */

import { NextRequest } from 'next/server';
import { asDbClient } from '@/lib/auth/session';
import { authorizeCronOrOwner } from '@/lib/cron-auth';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { safeSupplierSyncMessage } from '@/lib/supplier-errors';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { listSuppliers, syncSupplierProducts } from '@/modules/supplier';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const authError = await authorizeCronOrOwner(req);
    if (authError) {
      return authError;
    }
    const db = asDbClient(createAdminSupabaseClient());
    let supplierId: string | undefined;
    if (req.headers.get('content-type')?.includes('application/json')) {
      const body = (await readJsonBody(req)) as { supplierId?: string };
      supplierId = body.supplierId;
    }
    const suppliers = await listSuppliers(db);
    const targets = suppliers.filter((supplier) => supplier.status === 'active' && supplier.hasApiKey && (!supplierId || supplier.id === supplierId));
    const results = [];
    for (const supplier of targets) {
      const started = Date.now();
      try {
        const summary = await syncSupplierProducts(db, supplier.id);
        results.push({
          supplierId: supplier.id,
          name: supplier.name,
          ok: summary.errors.length === 0,
          synced: summary.synced,
          newProducts: summary.newProducts,
          updatedProducts: summary.updatedProducts,
          outOfStock: summary.outOfStock,
          stockChanged: summary.stockChanged,
          repriced: summary.repriced,
          autoPaused: summary.autoPaused,
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
            .eq('id', supplier.id);
        } catch {
          // Keep going so the next supplier still syncs.
        }
        results.push({
          supplierId: supplier.id,
          name: supplier.name,
          ok: false,
          synced: 0,
          newProducts: 0,
          updatedProducts: 0,
          outOfStock: 0,
          stockChanged: 0,
          repriced: 0,
          autoPaused: 0,
          errors: [message],
          durationMs: Date.now() - started,
        });
      }
    }
    return jsonSuccess({ results });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return POST(req);
}
