/**
 * @file app/api/supplier/sync/route.ts
 *
 * Syncs active suppliers. Cron secret or an owner session.
 */

import { NextRequest } from 'next/server';
import { asDbClient } from '@/lib/auth/session';
import { authorizeCronOrOwner } from '@/lib/cron-auth';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
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
      const summary = await syncSupplierProducts(db, supplier.id);
      results.push({ supplierId: supplier.id, supplierName: supplier.name, ...summary });
    }
    return jsonSuccess({ results });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return POST(req);
}
