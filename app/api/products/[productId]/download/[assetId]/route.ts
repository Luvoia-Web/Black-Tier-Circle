/**
 * @file app/api/products/[productId]/download/[assetId]/route.ts
 *
 * Generates a short-lived signed download URL for a product asset.
 *
 * For owner: any product asset
 * For reseller: only assets of products they have an active listing for
 * For customers: handled differently in Phase 6 (fulfillment)
 *
 * Returns: { url: string, expiresAt: string }
 * URL expires in 1 hour.
 * SECURITY: verifies access rights before generating URL.
 *
 * @module Api
 */

import { AuthError, NotFoundError, ValidationError } from '@/lib/errors';
import { asDbClient, requireUser } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import {
  SIGNED_URL_DEFAULT_TTL_SECONDS,
  generateDownloadUrl,
  getProductAsset,
} from '@/modules/catalog';
import { getListing } from '@/modules/pricing';
import { getTenantByUserId } from '@/modules/tenants';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly productId: string; readonly assetId: string };
};

/**
 * Returns a signed download URL after verifying the caller may access the asset.
 */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireUser();
    const db = asDbClient(session.admin);
    const asset = await getProductAsset(db, context.params.assetId);
    if (asset.productId !== context.params.productId) {
      throw new ValidationError('ASSET_MISMATCH', 'Asset does not belong to this product');
    }

    if (session.profile.role === 'reseller') {
      const tenant = await getTenantByUserId(db, session.user.id);
      try {
        const listing = await getListing(db, tenant.id, asset.productId);
        if (!listing.isVisible) {
          throw new AuthError('FORBIDDEN', 'You do not have an active listing for this product', 403);
        }
      } catch (error: unknown) {
        if (error instanceof NotFoundError) {
          throw new AuthError('FORBIDDEN', 'You do not have an active listing for this product', 403);
        }
        throw error;
      }
    } else if (session.profile.role !== 'owner') {
      throw new AuthError('FORBIDDEN', 'You do not have access to this resource', 403);
    }

    const url = await generateDownloadUrl(db, asset.id, SIGNED_URL_DEFAULT_TTL_SECONDS);
    const expiresAt = new Date(Date.now() + SIGNED_URL_DEFAULT_TTL_SECONDS * 1000).toISOString();
    return jsonSuccess({ url, expiresAt });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
