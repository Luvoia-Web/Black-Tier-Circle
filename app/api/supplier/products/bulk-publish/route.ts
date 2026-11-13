/**
 * @file app/api/supplier/products/bulk-publish/route.ts
 *
 * Publishes up to 200 supplier products from one markup.
 * One bad id is reported on its own row. The rest still publish.
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { bulkPublishSupplierProducts } from '@/modules/supplier';
import { z } from 'zod';

const Body = z.object({
  supplierProductIds: z.array(z.string().min(1)).min(1).max(200),
  markupPercent: z.number().min(0).max(999.99).optional(),
  buyerCategory: z.string().trim().min(1).max(80).optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const body = Body.parse(await readJsonBody(request));
    const result = await bulkPublishSupplierProducts(asDbClient(session.admin), {
      supplierProductIds: body.supplierProductIds,
      ...(body.markupPercent !== undefined ? { markupPercent: body.markupPercent } : {}),
      ...(body.buyerCategory ? { buyerCategory: body.buyerCategory } : {}),
    });
    return jsonSuccess(result);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
