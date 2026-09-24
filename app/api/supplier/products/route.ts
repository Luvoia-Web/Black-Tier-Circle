/**
 * @file app/api/supplier/products/route.ts
 *
 * Lists imported supplier products for owner review.
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { pageMeta, parsePageParams } from '@/lib/pagination';
import { listSupplierProducts } from '@/modules/supplier';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const url = new URL(request.url);
    const supplierId = url.searchParams.get('supplierId');
    if (!supplierId) {
      return jsonSuccess({ products: [], meta: pageMeta(1, 20, 0), pendingReviewCount: 0 });
    }
    const rows = await listSupplierProducts(asDbClient(session.admin), {
      supplierId,
      status: url.searchParams.get('status') ?? 'all',
      search: url.searchParams.get('search') ?? '',
    });
    const { page, limit } = parsePageParams(url.searchParams, { limit: 24, maxLimit: 100 });
    const start = (page - 1) * limit;
    return jsonSuccess({
      products: rows.slice(start, start + limit),
      meta: pageMeta(page, limit, rows.length),
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
