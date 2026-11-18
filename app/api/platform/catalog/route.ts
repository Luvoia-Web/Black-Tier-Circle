/**
 * @file app/api/platform/catalog/route.ts
 *
 * Paged catalog. One row per supplier item, plus products with no supplier row.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError, ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { parseCatalogFilters, readCatalog } from '@/modules/platform/catalog';
import { readInventory, saveReorderPoint } from '@/modules/platform/inventory';
import { readSupplierDesk } from '@/modules/platform/supplier-desk';
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
    const url = new URL(request.url);
    if (url.searchParams.get('section') === 'inventory') {
      return jsonSuccess(await readInventory(db, { role, tenantId: tenant?.id ?? null }, url.searchParams.get('attention') === '1'));
    }
    if (url.searchParams.get('section') === 'suppliers') {
      if (role !== 'owner') throw new AuthError('FORBIDDEN', 'Only the owner can open suppliers', 403);
      return jsonSuccess(await readSupplierDesk(db));
    }
    const page = await readCatalog(db, { role, tenantId: tenant?.id ?? null }, parseCatalogFilters(url.searchParams));
    return jsonSuccess(page);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    if (session.profile.role !== 'owner') {
      throw new AuthError('FORBIDDEN', 'Only the owner can set a reorder point', 403);
    }
    const body = await readJsonBody(request);
    const productId = typeof body.productId === 'string' ? body.productId : '';
    const point = typeof body.reorderPoint === 'number' ? body.reorderPoint : Number(body.reorderPoint);
    if (!productId) throw new ValidationError('INVALID_PRODUCT', 'Choose a product.');
    const saved = await saveReorderPoint(asDbClient(session.admin), productId, point);
    return jsonSuccess(saved);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
