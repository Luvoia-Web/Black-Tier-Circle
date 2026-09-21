/**
 * @file app/api/products/[productId]/listings/route.ts
 *
 * POST — reseller only: create or update a listing for this product.
 * Input: { retailPriceMinor: string } or { retailPriceStr: string }
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { CreateListingSchema } from '@/lib/validations/catalog';
import { createListing } from '@/modules/pricing';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly productId: string };
};

/**
 * Creates or upserts a reseller listing. Tenant ID comes from the session.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireReseller();
    const parsed = CreateListingSchema.parse(await readJsonBody(request));
    const priceStr = parsed.retailPriceStr ?? parsed.retailPriceMinor;
    const listing = await createListing(asDbClient(session.admin), {
      tenantId: session.tenant.id,
      productId: context.params.productId,
      retailPriceMinor: BigInt(priceStr ?? '0'),
    });
    return jsonSuccess(listing, 201);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
