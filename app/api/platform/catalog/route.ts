/**
 * @file app/api/platform/catalog/route.ts
 *
 * Paged catalog. One row per supplier item, plus products with no supplier row.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { parseCatalogFilters, readCatalog } from '@/modules/platform/catalog';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    const role = session.profile.role;
    if (role !== 'owner' && role !== 'reseller') {
      throw new AuthError('FORBIDDEN', 'You do not have access to the catalog', 403);
    }
    const db = asDbClient(session.admin);
    const tenant = role === 'reseller' ? await getTenantByUserId(db, session.user.id) : null;
    const page = await readCatalog(db, { role, tenantId: tenant?.id ?? null }, parseCatalogFilters(new URL(request.url).searchParams));
    return jsonSuccess(page);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
