/**
 * @file app/api/products/[productId]/assets/[assetId]/route.ts
 *
 * DELETE — owner only: remove an asset record and its private storage object.
 *
 * @module Api
 */

import { ValidationError } from '@/lib/errors';
import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { deleteAsset, getProductAsset } from '@/modules/catalog';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly productId: string; readonly assetId: string };
};

/**
 * Deletes a product file. Storage path is never returned.
 */
export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const db = asDbClient(session.admin);
    const asset = await getProductAsset(db, context.params.assetId);
    if (asset.productId !== context.params.productId) {
      throw new ValidationError('ASSET_MISMATCH', 'Asset does not belong to this product');
    }
    await deleteAsset(db, asset.id);
    return jsonSuccess({ deleted: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
