/**
 * @file app/api/platform/orders/route.ts
 *
 * Paged orders for the signed-in role. `format=csv` downloads the filtered set.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { parseOrderFilters, readOrders, readOrdersCsv } from '@/modules/platform/orders';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    const role = session.profile.role;
    if (role !== 'owner' && role !== 'reseller') {
      throw new AuthError('FORBIDDEN', 'You do not have access to orders', 403);
    }
    const db = asDbClient(session.admin);
    const tenant = role === 'reseller' ? await getTenantByUserId(db, session.user.id) : null;
    const url = new URL(request.url);
    const filters = parseOrderFilters(url.searchParams);
    if (url.searchParams.get('format') === 'csv') {
      const csv = await readOrdersCsv(db, tenant?.id ?? null, filters);
      return new Response(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="orders.csv"',
        },
      });
    }
    return jsonSuccess(await readOrders(db, tenant?.id ?? null, filters));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
