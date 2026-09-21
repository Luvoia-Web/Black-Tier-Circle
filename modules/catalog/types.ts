/**
 * @file modules/catalog/types.ts
 *
 * Product catalog types aligned with the products table.
 *
 * @module Catalog
 */

export type ProductStatus = 'draft' | 'published' | 'paused' | 'archived';
export type DeliveryType = 'file_reusable' | 'inventory_unit' | 'manual' | 'supplier_api';

export type Product = {
  readonly id: string;
  readonly sku: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly deliveryType: DeliveryType;
  readonly status: ProductStatus;
  readonly wholesalePriceMinor: bigint;
  readonly retailPriceMinor: bigint;
  readonly stockUnlimited: boolean;
  readonly stockCount: number | null;
  readonly resellerEligible: boolean;
  readonly maxPurchaseQty: number;
  readonly version: number;
};
