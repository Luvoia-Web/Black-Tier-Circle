/**
 * @file app/api/supplier/balance/route.ts
 *
 * Owner view of supplier balances and the pending-review count.
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { listSuppliers, pendingReviewCount, refreshSupplierBalance } from '@/modules/supplier';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const db = asDbClient(session.admin);
    const url = new URL(request.url);
    const refreshId = url.searchParams.get('refresh');
    if (refreshId) {
      await refreshSupplierBalance(db, refreshId);
    }
    const suppliers = await listSuppliers(db);
    const pending = await pendingReviewCount(db);
    return jsonSuccess({
      pendingReviewCount: pending,
      balances: suppliers.map((supplier) => ({
        supplierId: supplier.id,
        supplierName: supplier.name,
        slug: supplier.slug,
        baseUrl: supplier.baseUrl,
        status: supplier.status,
        balance: supplier.balanceUsdt,
        membership: supplier.membershipTier,
        checkedAt: supplier.balanceCheckedAt,
        lastSyncAt: supplier.lastSyncAt,
        productCount: supplier.productCount,
        hasApiKey: supplier.hasApiKey,
      })),
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
