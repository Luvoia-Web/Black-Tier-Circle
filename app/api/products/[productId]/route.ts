/**
 * @file app/api/products/[productId]/route.ts
 *
 * GET — owner, or reseller with an active listing
 * PATCH — owner only: update product fields
 *
 * @module Api
 */

import { AuthError, NotFoundError } from '@/lib/errors';
import { asDbClient, requireUser } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { UpdateProductSchema } from '@/lib/validations/catalog';
import { getProduct, getProductWithAssets, toPublicAsset, updateProduct } from '@/modules/catalog';
import { getListing } from '@/modules/pricing';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly productId: string };
};

/**
 * Returns product details. Asset storage paths are stripped.
 */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireUser();
    const db = asDbClient(session.admin);
    const product = await getProductWithAssets(db, context.params.productId);

    if (session.profile.role === 'owner') {
      return jsonSuccess({
        ...product,
        assets: product.assets.map(toPublicAsset),
      });
    }

    if (session.profile.role === 'reseller') {
      const tenant = await getTenantByUserId(db, session.user.id);
      try {
        await getListing(db, tenant.id, product.id);
      } catch (error: unknown) {
        if (error instanceof NotFoundError) {
          throw new AuthError('FORBIDDEN', 'You do not have a listing for this product', 403);
        }
        throw error;
      }
      return jsonSuccess({
        ...product,
        assets: product.assets.map(toPublicAsset),
      });
    }

    throw new AuthError('FORBIDDEN', 'You do not have access to this resource', 403);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

/**
 * Updates product fields. SKU cannot be changed.
 */
export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireUser();
    if (session.profile.role !== 'owner') {
      throw new AuthError('FORBIDDEN', 'Owner access required', 403);
    }
    const parsed = UpdateProductSchema.parse(await readJsonBody(request));
    const product = await updateProduct(asDbClient(session.admin), context.params.productId, {
      ...(parsed.title !== undefined ? { title: parsed.title } : {}),
      ...(parsed.description !== undefined ? { description: parsed.description } : {}),
      ...(parsed.category !== undefined ? { category: parsed.category } : {}),
      ...(parsed.deliveryType !== undefined ? { deliveryType: parsed.deliveryType } : {}),
      ...(parsed.wholesalePriceStr !== undefined ? { wholesalePriceMinor: parsed.wholesalePriceStr } : {}),
      ...(parsed.retailPriceStr !== undefined ? { retailPriceMinor: parsed.retailPriceStr } : {}),
      ...(parsed.stockUnlimited !== undefined ? { stockUnlimited: parsed.stockUnlimited } : {}),
      ...(parsed.stockCount !== undefined ? { stockCount: parsed.stockCount } : {}),
      ...(parsed.resellerEligible !== undefined ? { resellerEligible: parsed.resellerEligible } : {}),
      ...(parsed.maxPurchaseQty !== undefined ? { maxPurchaseQty: parsed.maxPurchaseQty } : {}),
      ...(parsed.estimatedDeliveryMinutes !== undefined
        ? { estimatedDeliveryMinutes: parsed.estimatedDeliveryMinutes }
        : {}),
      ...(parsed.status !== undefined ? { status: parsed.status } : {}),
    });
    return jsonSuccess(product);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
