/**
 * Bulk product actions. One bad id is one result row.
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { bulkManageProducts } from '@/modules/catalog/manage';
import { z } from 'zod';

const Body = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(['delete', 'publish', 'pause', 'archive', 'set-category']),
  category: z.string().trim().max(80).nullable().optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const body = Body.parse(await readJsonBody(request));
    const result = await bulkManageProducts(asDbClient(session.admin), {
      productIds: body.productIds,
      action: body.action,
      ...(body.category !== undefined ? { category: body.category } : {}),
    });
    return jsonSuccess(result);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
