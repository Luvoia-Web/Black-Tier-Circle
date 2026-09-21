/**
 * @file app/api/reseller/listings/route.ts
 *
 * GET — reseller only: list own tenant's listings with product details
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { listPublishedProducts } from '@/modules/catalog';
import { listResellerListings } from '@/modules/pricing';

export const dynamic = 'force-dynamic';

/**
 * Returns the reseller's listings plus the catalog of products they can still add.
 */
export async function GET(): Promise<Response> {
  try {
    const session = await requireReseller();
    const db = asDbClient(session.admin);
    const [listings, available] = await Promise.all([
      listResellerListings(db, session.tenant.id),
      listPublishedProducts(db),
    ]);
    return jsonSuccess({ listings, available });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
