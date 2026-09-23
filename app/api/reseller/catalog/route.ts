/**
 * @file app/api/reseller/catalog/route.ts
 *
 * Live owner catalog for the signed-in reseller, with that reseller's listing attached.
 * Published, reseller-eligible products appear as soon as the owner publishes them.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { CreateListingSchema } from '@/lib/validations/catalog';
import { listPublishedProducts } from '@/modules/catalog';
import { createListing, getMarginMinor, getMarginPercent, listResellerListings } from '@/modules/pricing';

export const dynamic = 'force-dynamic';

type CatalogListing = {
  readonly id: string;
  readonly retailPriceMinor: string;
  readonly isVisible: boolean;
};

type CatalogRow = {
  readonly id: string;
  readonly sku: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly deliveryType: string;
  readonly wholesalePriceMinor: string;
  readonly retailPriceMinor: string;
  readonly stockUnlimited: boolean;
  readonly stockCount: number | null;
  readonly estimatedDeliveryMinutes: number | null;
  readonly listing: CatalogListing | null;
  readonly isListed: boolean;
  readonly marginPercent: number | null;
  readonly profitMinor: string | null;
};

/**
 * Returns every published reseller-eligible product plus this tenant's listing, if any.
 */
export async function GET(): Promise<Response> {
  try {
    const session = await requireReseller();
    const db = asDbClient(session.admin);
    const [products, listings] = await Promise.all([
      listPublishedProducts(db),
      listResellerListings(db, session.tenant.id),
    ]);
    const byProduct = new Map(listings.map((listing) => [listing.productId, listing]));
    const rows: CatalogRow[] = products.map((product) => {
      const listing = byProduct.get(product.id) ?? null;
      const profit = listing ? getMarginMinor(product.wholesalePriceMinor, listing.retailPriceMinor) : null;
      return {
        id: product.id,
        sku: product.sku,
        title: product.title,
        description: product.description,
        category: product.category,
        deliveryType: product.deliveryType,
        wholesalePriceMinor: product.wholesalePriceMinor.toString(),
        retailPriceMinor: product.retailPriceMinor.toString(),
        stockUnlimited: product.stockUnlimited,
        stockCount: product.stockCount,
        estimatedDeliveryMinutes: product.estimatedDeliveryMinutes,
        listing: listing
          ? {
              id: listing.id,
              retailPriceMinor: listing.retailPriceMinor.toString(),
              isVisible: listing.isVisible,
            }
          : null,
        isListed: listing !== null,
        marginPercent: listing ? getMarginPercent(product.wholesalePriceMinor, listing.retailPriceMinor) : null,
        profitMinor: profit === null ? null : profit.toString(),
      };
    });
    rows.sort((left, right) => {
      if (left.isListed !== right.isListed) {
        return left.isListed ? 1 : -1;
      }
      return left.title.localeCompare(right.title);
    });
    return jsonSuccess(rows);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

/**
 * Creates or updates the reseller's listing for a catalog product.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    const body = await readJsonBody(request);
    const parsed = CreateListingSchema.parse(body);
    const productId = parsed.productId;
    if (!productId) {
      throw new ValidationError('INVALID_INPUT', 'productId is required');
    }
    const priceStr = parsed.retailPriceStr ?? parsed.retailPriceMinor;
    const listing = await createListing(asDbClient(session.admin), {
      tenantId: session.tenant.id,
      productId,
      retailPriceMinor: BigInt(priceStr ?? '0'),
    });
    return jsonSuccess(listing, 201);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
