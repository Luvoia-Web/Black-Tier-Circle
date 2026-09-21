/**
 * @file modules/pricing/types.ts
 *
 * Server-side price snapshot types.
 *
 * @module Pricing
 */

export type PriceQuote = {
  readonly productId: string;
  readonly productVersion: number;
  readonly retailPriceMinor: bigint;
  readonly wholesalePriceMinor: bigint;
  readonly currency: 'USDT';
};
