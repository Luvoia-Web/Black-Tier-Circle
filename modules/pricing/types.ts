/**
 * @file modules/pricing/types.ts
 *
 * Server-side pricing types. Retail listing prices must be bigint minor units.
 *
 * @module Pricing
 */

import type { Product } from '@/modules/catalog/types';

export type PriceQuote = {
  readonly productId: string;
  readonly productVersion: number;
  readonly retailPriceMinor: bigint;
  readonly wholesalePriceMinor: bigint;
  readonly currency: 'USDT';
};

export type ResellerListing = {
  id: string;
  tenantId: string;
  productId: string;
  /** Reseller's retail price in USDT minor units — must be >= product wholesale price */
  retailPriceMinor: bigint;
  isVisible: boolean;
  /** True when the reseller set a per-product price (wins over bulk markup). */
  priceOverride: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ResellerListingWithProduct = ResellerListing & {
  product: Product;
};

export type CreateListingInput = {
  tenantId: string;
  productId: string;
  /** Must be >= product.wholesalePriceMinor */
  retailPriceMinor: bigint;
};

export type ResellerListingRow = {
  readonly id: string;
  readonly tenant_id: string;
  readonly product_id: string;
  readonly retail_price: string | number | bigint;
  readonly is_visible: boolean;
  readonly price_override?: boolean | null;
  readonly created_at: string;
  readonly updated_at: string;
};
