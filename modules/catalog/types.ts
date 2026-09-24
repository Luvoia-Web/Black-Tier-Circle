/**
 * @file modules/catalog/types.ts
 *
 * Type definitions for the product catalog module.
 * All prices are in USDT minor units (bigint × 10^6).
 * Never use these types with float amounts.
 *
 * @module Catalog
 */

export type DeliveryType = 'file_reusable' | 'inventory_unit' | 'manual' | 'supplier_api';
export type ProductStatus = 'draft' | 'published' | 'paused' | 'archived';

export type Product = {
  id: string;
  sku: string;
  title: string;
  description: string | null;
  category: string | null;
  deliveryType: DeliveryType;
  status: ProductStatus;
  /** Wholesale price in USDT minor units — what resellers pay per sale */
  wholesalePriceMinor: bigint;
  /** Default retail price in USDT minor units — owner store default */
  retailPriceMinor: bigint;
  stockUnlimited: boolean;
  stockCount: number | null;
  resellerEligible: boolean;
  maxPurchaseQty: number;
  estimatedDeliveryMinutes: number | null;
  /** SKU as known to the external supplier. Null for non-supplier products. */
  supplierSku: string | null;
  supplierId: string | null;
  requiresEmailActivation: boolean;
  /** Arbitrary supplier-specific metadata. */
  supplierMetadata: Record<string, unknown>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductAsset = {
  id: string;
  productId: string;
  storagePath: string;
  contentType: string;
  fileSizeBytes: number | null;
  isPreview: boolean;
  version: number;
  createdAt: Date;
};

export type CreateProductInput = {
  sku: string;
  title: string;
  description?: string;
  category?: string;
  deliveryType: DeliveryType;
  /** In USDT minor units */
  wholesalePriceMinor: bigint;
  /** In USDT minor units */
  retailPriceMinor: bigint;
  stockUnlimited?: boolean;
  stockCount?: number;
  resellerEligible?: boolean;
  maxPurchaseQty?: number;
  estimatedDeliveryMinutes?: number;
  supplierSku?: string | null;
  supplierMetadata?: Record<string, unknown>;
};

export type UpdateProductInput = {
  title?: string;
  description?: string | null;
  category?: string | null;
  deliveryType?: DeliveryType;
  wholesalePriceMinor?: bigint;
  retailPriceMinor?: bigint;
  stockUnlimited?: boolean;
  stockCount?: number | null;
  resellerEligible?: boolean;
  maxPurchaseQty?: number;
  estimatedDeliveryMinutes?: number | null;
  status?: ProductStatus;
  supplierSku?: string | null;
  supplierMetadata?: Record<string, unknown>;
};

export type ProductWithAssets = Product & {
  assets: ProductAsset[];
};

export type ProductRow = {
  readonly id: string;
  readonly sku: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly delivery_type: DeliveryType;
  readonly status: ProductStatus;
  readonly wholesale_price: string | number | bigint;
  readonly retail_price: string | number | bigint;
  readonly stock_unlimited: boolean;
  readonly stock_count: number | null;
  readonly reseller_eligible: boolean;
  readonly max_purchase_qty: number;
  readonly estimated_delivery_minutes: number | null;
  readonly supplier_sku?: string | null;
  readonly supplier_id?: string | null;
  readonly requires_email_activation?: boolean | null;
  readonly supplier_metadata?: Record<string, unknown> | null;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
};

export type ProductAssetRow = {
  readonly id: string;
  readonly product_id: string;
  readonly storage_path: string;
  readonly content_type: string;
  readonly file_size_bytes: string | number | bigint | null;
  readonly is_preview: boolean;
  readonly version: number;
  readonly created_at: string;
};

export type PublicProductAsset = Omit<ProductAsset, 'storagePath'>;
