/**
 * @file app/api/products/[productId]/status/route.ts
 *
 * PATCH — owner only: { status: 'published' | 'paused' | 'archived' }
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { UpdateProductStatusSchema } from '@/lib/validations/catalog';
import { updateProductStatus } from '@/modules/catalog';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly productId: string };
};

/**
 * Moves a product through draft → published → paused, or archives it.
 */
export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const body = UpdateProductStatusSchema.parse(await readJsonBody(request));
    const product = await updateProductStatus(
      asDbClient(session.admin),
      context.params.productId,
      body.status,
    );
    return jsonSuccess(product);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
