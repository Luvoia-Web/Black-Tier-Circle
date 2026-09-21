/**
 * @file modules/pricing/index.ts
 *
 * Server-side pricing and reseller listings.
 * Never trust browser or bot submitted prices for wholesale.
 *
 * @module Pricing
 */

import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import { formatUsdt } from '@/lib/money';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { getProduct, getProductById } from '@/modules/catalog';
import { asMinorUnits } from '@/modules/catalog/map';
import type { PriceQuote } from './types';
import type {
  CreateListingInput,
  ResellerListing,
  ResellerListingRow,
  ResellerListingWithProduct,
} from './types';

export type { PriceQuote, CreateListingInput, ResellerListing, ResellerListingWithProduct } from './types';

function asListingRow(data: unknown): ResellerListingRow {
  return data as ResellerListingRow;
}

function mapListingRow(row: ResellerListingRow): ResellerListing {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    productId: row.product_id,
    retailPriceMinor: asMinorUnits(row.retail_price),
    isVisible: row.is_visible,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function assertRetailAtOrAboveWholesale(retailPriceMinor: bigint, wholesalePriceMinor: bigint): void {
  if (retailPriceMinor < wholesalePriceMinor) {
    throw new ValidationError(
      'PRICE_BELOW_WHOLESALE',
      `Retail price must be at least ${formatUsdt(wholesalePriceMinor)} (wholesale price)`,
    );
  }
}

/**
 * Builds an immutable price snapshot for order creation.
 *
 * @param productId - Catalog product id
 * @param resellerRetailPriceMinor - Optional reseller listing price in minor units
 * @returns Quote using server catalog plus optional reseller retail override
 *
 * INVARIANT: Wholesale always comes from the owner catalog, never the client.
 */
export function quoteProductPrice(
  productId: string,
  resellerRetailPriceMinor?: bigint,
): PriceQuote {
  const product = getProductById(productId);
  return {
    productId: product.id,
    productVersion: product.version,
    retailPriceMinor: resellerRetailPriceMinor ?? product.retailPriceMinor,
    wholesalePriceMinor: product.wholesalePriceMinor,
    currency: 'USDT',
  };
}

/**
 * Creates or updates a reseller listing for a published, eligible product.
 *
 * @param supabase - Database client
 * @param input - Tenant, product, and retail price in minor units
 */
export async function createListing(
  supabase: DbClient,
  input: CreateListingInput,
): Promise<ResellerListing> {
  const product = await getProduct(supabase, input.productId);
  if (product.status !== 'published') {
    throw new ValidationError('PRODUCT_NOT_LISTABLE', 'Product must be published before it can be listed');
  }
  if (!product.resellerEligible) {
    throw new ValidationError('PRODUCT_NOT_LISTABLE', 'This product is not available for resellers');
  }
  assertRetailAtOrAboveWholesale(input.retailPriceMinor, product.wholesalePriceMinor);

  const existing = await supabase
    .from('reseller_listings')
    .select('*')
    .eq('tenant_id', input.tenantId)
    .eq('product_id', input.productId)
    .maybeSingle();
  if (existing.error) {
    throw new AppError('LISTING_LOOKUP_FAILED', existing.error.message, 500);
  }

  if (existing.data !== null) {
    const { data, error } = await supabase
      .from('reseller_listings')
      .update({
        retail_price: input.retailPriceMinor.toString(),
        is_visible: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', asListingRow(existing.data).id)
      .select('*')
      .single();
    if (error || data === null) {
      throw new AppError('LISTING_UPDATE_FAILED', error?.message ?? 'Unable to update listing', 500);
    }
    return mapListingRow(asListingRow(data));
  }

  const { data, error } = await supabase
    .from('reseller_listings')
    .insert({
      tenant_id: input.tenantId,
      product_id: input.productId,
      retail_price: input.retailPriceMinor.toString(),
      is_visible: true,
    })
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('LISTING_CREATE_FAILED', error?.message ?? 'Unable to create listing', 500);
  }
  return mapListingRow(asListingRow(data));
}

/**
 * Loads a listing for a tenant and product.
 *
 * @param supabase - Database client
 * @param tenantId - Session tenant ID
 * @param productId - Product UUID
 * @throws NotFoundError if no listing
 */
export async function getListing(
  supabase: DbClient,
  tenantId: string,
  productId: string,
): Promise<ResellerListing> {
  const { data, error } = await supabase
    .from('reseller_listings')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('product_id', productId)
    .maybeSingle();
  if (error) {
    throw new AppError('LISTING_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null) {
    throw new NotFoundError('listing');
  }
  return mapListingRow(asListingRow(data));
}

/**
 * Lists all listings for a tenant with joined product details.
 *
 * @param supabase - Database client
 * @param tenantId - Session tenant ID
 */
export async function listResellerListings(
  supabase: DbClient,
  tenantId: string,
): Promise<ResellerListingWithProduct[]> {
  const result = (await supabase
    .from('reseller_listings')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('LISTING_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  const listings: ResellerListingWithProduct[] = [];
  for (const row of rows) {
    const listing = mapListingRow(asListingRow(row));
    const product = await getProduct(supabase, listing.productId);
    listings.push({ ...listing, product });
  }
  return listings;
}

async function getListingByIdForTenant(
  supabase: DbClient,
  listingId: string,
  tenantId: string,
): Promise<ResellerListing> {
  const { data, error } = await supabase
    .from('reseller_listings')
    .select('*')
    .eq('id', listingId)
    .maybeSingle();
  if (error) {
    throw new AppError('LISTING_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null) {
    throw new NotFoundError('listing');
  }
  const listing = mapListingRow(asListingRow(data));
  if (listing.tenantId !== tenantId) {
    throw new NotFoundError('listing');
  }
  return listing;
}

/**
 * Updates a listing price after verifying tenant ownership from the session.
 *
 * @param supabase - Database client
 * @param listingId - Listing UUID
 * @param tenantId - Session tenant ID (never from the client body)
 * @param newPriceMinor - New retail price in minor units
 */
export async function updateListingPrice(
  supabase: DbClient,
  listingId: string,
  tenantId: string,
  newPriceMinor: bigint,
): Promise<ResellerListing> {
  const listing = await getListingByIdForTenant(supabase, listingId, tenantId);
  const product = await getProduct(supabase, listing.productId);
  assertRetailAtOrAboveWholesale(newPriceMinor, product.wholesalePriceMinor);
  const { data, error } = await supabase
    .from('reseller_listings')
    .update({
      retail_price: newPriceMinor.toString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', listingId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('LISTING_UPDATE_FAILED', error?.message ?? 'Unable to update listing price', 500);
  }
  return mapListingRow(asListingRow(data));
}

/**
 * Sets listing visibility after verifying tenant ownership.
 *
 * @param supabase - Database client
 * @param listingId - Listing UUID
 * @param tenantId - Session tenant ID
 * @param isVisible - Target visibility
 */
export async function setListingVisibility(
  supabase: DbClient,
  listingId: string,
  tenantId: string,
  isVisible: boolean,
): Promise<ResellerListing> {
  await getListingByIdForTenant(supabase, listingId, tenantId);
  const { data, error } = await supabase
    .from('reseller_listings')
    .update({
      is_visible: isVisible,
      updated_at: new Date().toISOString(),
    })
    .eq('id', listingId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('LISTING_UPDATE_FAILED', error?.message ?? 'Unable to update listing visibility', 500);
  }
  return mapListingRow(asListingRow(data));
}

/**
 * Flips listing visibility so a reseller can hide a product from their bot.
 *
 * @param supabase - Database client
 * @param listingId - Listing UUID
 * @param tenantId - Session tenant ID
 */
export async function toggleListingVisibility(
  supabase: DbClient,
  listingId: string,
  tenantId: string,
): Promise<ResellerListing> {
  const listing = await getListingByIdForTenant(supabase, listingId, tenantId);
  return setListingVisibility(supabase, listingId, tenantId, !listing.isVisible);
}

/**
 * Returns profit margin in USDT minor units (retail − wholesale).
 *
 * @param wholesalePriceMinor - Cost in minor units
 * @param retailPriceMinor - Selling price in minor units
 */
export function getMarginMinor(wholesalePriceMinor: bigint, retailPriceMinor: bigint): bigint {
  return retailPriceMinor - wholesalePriceMinor;
}

/**
 * Returns margin as a percentage of retail, rounded to 2 decimal places.
 * Uses Number() only for the display value — never stored.
 *
 * @param wholesalePriceMinor - Cost in minor units
 * @param retailPriceMinor - Selling price in minor units
 */
export function getMarginPercent(wholesalePriceMinor: bigint, retailPriceMinor: bigint): number {
  if (retailPriceMinor <= 0n) {
    return 0;
  }
  const scaled = (getMarginMinor(wholesalePriceMinor, retailPriceMinor) * 10000n) / retailPriceMinor;
  return Number(scaled) / 100;
}
