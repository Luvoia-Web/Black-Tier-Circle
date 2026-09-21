/**
 * @file modules/pricing/index.ts
 *
 * Server-side pricing. Never trust browser or bot submitted prices.
 *
 * @module Pricing
 */

import { getProductById } from '@/modules/catalog';
import type { PriceQuote } from './types';

export type { PriceQuote } from './types';

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
