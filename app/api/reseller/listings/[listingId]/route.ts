/**
 * @file app/api/reseller/listings/[listingId]/route.ts
 *
 * PATCH — reseller only: update price or toggle visibility
 * SECURITY: verify listing belongs to reseller's tenant
 *
 * @module Api
 */

import { ValidationError } from '@/lib/errors';
import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { UpdateListingSchema } from '@/lib/validations/catalog';
import { setListingVisibility, updateListingPrice, type ResellerListing } from '@/modules/pricing';

export const dynamic = 'force-dynamic';

type RouteContext = {
  readonly params: { readonly listingId: string };
};

/**
 * Updates listing price and/or visibility. Tenant ID comes from the session.
 */
export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await requireReseller();
    const parsed = UpdateListingSchema.parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    const listingId = context.params.listingId;
    const tenantId = session.tenant.id;
    const priceStr = parsed.retailPriceStr ?? parsed.retailPriceMinor;

    if (priceStr === undefined && parsed.isVisible === undefined) {
      throw new ValidationError('INVALID_INPUT', 'Provide retailPriceStr or isVisible');
    }

    let listing: ResellerListing | null = null;
    if (priceStr !== undefined) {
      listing = await updateListingPrice(db, listingId, tenantId, BigInt(priceStr));
    }
    if (parsed.isVisible !== undefined) {
      listing = await setListingVisibility(db, listingId, tenantId, parsed.isVisible);
    }
    if (listing === null) {
      throw new ValidationError('INVALID_INPUT', 'Provide retailPriceStr or isVisible');
    }
    return jsonSuccess(listing);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
