/**
 * @file app/api/platform/catalog/detail/route.ts
 *
 * One catalog row plus recent orders. A reseller cannot open another store's item.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError, ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { readCatalogDetail } from '@/modules/platform/catalog';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    const role = session.profile.role;
    if (role !== 'owner' && role !== 'reseller') {
      throw new AuthError('FORBIDDEN', 'You do not have access to the catalog', 403);
    }
    const id = new URL(request.url).searchParams.get('id') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new ValidationError('INVALID_ID', 'Choose an item from the catalog.');
    }
    const db = asDbClient(session.admin);
    const tenant = role === 'reseller' ? await getTenantByUserId(db, session.user.id) : null;
    return jsonSuccess(await readCatalogDetail(db, id, tenant?.id ?? null));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
