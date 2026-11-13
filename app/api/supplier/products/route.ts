/**
 * @file app/api/supplier/products/route.ts
 *
 * Lists imported supplier products for owner review.
 * Paging uses a database range and an exact count.
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { listSupplierProducts } from '@/modules/supplier';

export const dynamic = 'force-dynamic';

const SORTS = ['name', 'cost', 'stock', 'synced'] as const;
const STOCKS = ['all', 'in', 'out'] as const;
const PUSHED = ['all', 'published', 'not_published'] as const;

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const url = new URL(request.url);
    const supplierId = url.searchParams.get('supplierId');
    if (!supplierId) {
      return jsonSuccess({
        products: [],
        total: 0,
        page: 1,
        limit: 24,
        counts: { pending_review: 0, published: 0, rejected: 0, paused: 0 },
      });
    }
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const requested = Number(url.searchParams.get('limit') ?? '24') || 24;
    const limit = [24, 48, 96].includes(requested) ? requested : 24;
    const listed = await listSupplierProducts(asDbClient(session.admin), {
      supplierId,
      page,
      limit,
      status: url.searchParams.get('status') ?? 'all',
      search: url.searchParams.get('search') ?? '',
      sort: oneOf(url.searchParams.get('sort'), SORTS, 'name'),
      stock: oneOf(url.searchParams.get('stock'), STOCKS, 'all'),
      pushed: oneOf(url.searchParams.get('pushed'), PUSHED, 'all'),
    });
    return jsonSuccess(listed);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
