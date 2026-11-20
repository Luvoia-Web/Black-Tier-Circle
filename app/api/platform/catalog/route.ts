/**
 * @file app/api/platform/catalog/route.ts
 *
 * Paged catalog. One row per supplier item, plus products with no supplier row.
 */

import { z } from 'zod';
import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { assertRateLimit } from '@/lib/request-rate-limit';
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

const ReorderPointSchema = z.object({
  productId: z.string().uuid('Choose a valid product.'),
  reorderPoint: z.coerce.number().int().min(0).max(1_000_000),
});

export async function PATCH(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    if (session.profile.role !== 'owner') {
      throw new AuthError('FORBIDDEN', 'Only the owner can set a reorder point', 403);
    }
    await assertRateLimit(`catalog-reorder:${session.user.id}`, 30);
    const body = ReorderPointSchema.parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    const saved = await saveReorderPoint(db, body.productId, body.reorderPoint);
    await db.from('audit_log').insert({
      actor_id: session.user.id,
      tenant_id: null,
      action: 'product.reorder_point',
      target_type: 'product',
      target_id: body.productId,
      reason: `Set reorder point to ${body.reorderPoint}`,
      after_val: { reorderPoint: body.reorderPoint },
    });
    return jsonSuccess(saved);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
