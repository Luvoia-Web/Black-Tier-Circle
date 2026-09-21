/**
 * @file app/api/v1/products/route.ts
 *
 * GET: list published, reseller-eligible products with an active listing for this tenant.
 * Scope: products:read
 *
 * @module ApiV1
 */

import { API_CONFIG } from '@/lib/api-config';
import { authenticateV1Request, handleV1Error, parsePagination, v1Db, v1Success } from '@/lib/v1-auth';
import { minorToUsdt } from '@/lib/money';
import { listResellerListings } from '@/modules/pricing';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Lists available products for this reseller's tenant.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const ctx = await authenticateV1Request(
      request,
      'products:read',
      'products',
      API_CONFIG.rateLimits.readRequestsPerMinute,
    );
    const { page, limit, offset } = parsePagination(new URL(request.url).searchParams);
    const category = new URL(request.url).searchParams.get('category');
    const db = v1Db();
    const listings = await listResellerListings(db, ctx.tenantId);
    const mapped = listings
      .filter((listing) => listing.isVisible)
      .filter((listing) => listing.product.status === 'published' && listing.product.resellerEligible)
      .filter((listing) => (category ? listing.product.category === category : true))
      .map((listing) => ({
        id: listing.product.id,
        sku: listing.product.sku,
        title: listing.product.title,
        description: listing.product.description,
        category: listing.product.category,
        deliveryType: listing.product.deliveryType,
        retailPrice: minorToUsdt(listing.retailPriceMinor),
        wholesalePrice: minorToUsdt(listing.product.wholesalePriceMinor),
        estimatedDeliveryMinutes: listing.product.estimatedDeliveryMinutes,
        stockAvailable:
          listing.product.stockUnlimited || (listing.product.stockCount ?? 0) > 0,
      }));
    const total = mapped.length;
    const slice = mapped.slice(offset, offset + limit);
    return v1Success(slice, {
      page,
      limit,
      total,
      hasMore: offset + slice.length < total,
    });
  } catch (error: unknown) {
    return handleV1Error(error);
  }
}
