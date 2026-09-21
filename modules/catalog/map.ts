/**
 * @file modules/catalog/map.ts
 *
 * Maps product and asset database rows to domain types.
 *
 * @module Catalog
 */

import type { Product, ProductAsset, ProductAssetRow, ProductRow } from './types';

/**
 * Converts a database numeric/bigint value into USDT minor units.
 *
 * @param value - Driver-returned integer
 */
export function asMinorUnits(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  return BigInt(value);
}

/**
 * Maps a products table row.
 *
 * @param row - Database row
 */
export function mapProductRow(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    title: row.title,
    description: row.description,
    category: row.category,
    deliveryType: row.delivery_type,
    status: row.status,
    wholesalePriceMinor: asMinorUnits(row.wholesale_price),
    retailPriceMinor: asMinorUnits(row.retail_price),
    stockUnlimited: row.stock_unlimited,
    stockCount: row.stock_count,
    resellerEligible: row.reseller_eligible,
    maxPurchaseQty: row.max_purchase_qty,
    estimatedDeliveryMinutes: row.estimated_delivery_minutes,
    supplierSku: row.supplier_sku ?? null,
    supplierMetadata: row.supplier_metadata ?? {},
    version: row.version,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Maps a product_assets table row.
 *
 * @param row - Database row
 */
export function mapProductAssetRow(row: ProductAssetRow): ProductAsset {
  return {
    id: row.id,
    productId: row.product_id,
    storagePath: row.storage_path,
    contentType: row.content_type,
    fileSizeBytes: row.file_size_bytes === null ? null : Number(asMinorUnits(row.file_size_bytes)),
    isPreview: row.is_preview,
    version: row.version,
    createdAt: new Date(row.created_at),
  };
}

/**
 * Strips the raw storage path before sending an asset to a client.
 *
 * @param asset - Domain asset
 */
export function toPublicAsset(asset: ProductAsset): Omit<ProductAsset, 'storagePath'> {
  const { storagePath: _storagePath, ...rest } = asset;
  return rest;
}
