/**
 * @file modules/catalog/index.ts
 *
 * Product catalog: owner CRUD, assets, and signed download URLs.
 *
 * Prices are always server-defined in USDT minor units (bigint).
 * Storage paths never leave this module except when generating signed URLs.
 *
 * @module Catalog
 */

import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import { invalidateCache, withCache } from '@/lib/cache';
import { PRODUCT_LIST_COLUMNS } from '@/lib/lookups';
import { usdtToMinor } from '@/lib/money';
import type { DbClient, QueryResult, StorageAdapter } from '@/lib/supabase/query';
import { mapProductAssetRow, mapProductRow, toPublicAsset } from './map';
import type {
  CreateProductInput,
  Product,
  ProductAsset,
  ProductAssetRow,
  ProductRow,
  ProductStatus,
  ProductWithAssets,
  PublicProductAsset,
  UpdateProductInput,
} from './types';

export type {
  CreateProductInput,
  DeliveryType,
  Product,
  ProductAsset,
  ProductStatus,
  ProductWithAssets,
  PublicProductAsset,
  UpdateProductInput,
} from './types';
export { toPublicAsset } from './map';

export const PRODUCT_FILES_BUCKET = 'product-files';
export const PRODUCT_PREVIEWS_BUCKET = 'product-previews';
export const SIGNED_URL_DEFAULT_TTL_SECONDS = 3600;

const SANDBOX_NOW = new Date('2026-01-01T00:00:00.000Z');

const SANDBOX_PRODUCTS: readonly Product[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    sku: 'EBOOK-DEMO-001',
    title: 'Demo Ebook',
    description: 'Synthetic test product',
    category: 'ebooks',
    deliveryType: 'file_reusable',
    status: 'published',
    wholesalePriceMinor: usdtToMinor('5'),
    retailPriceMinor: usdtToMinor('10'),
    stockUnlimited: true,
    stockCount: null,
    resellerEligible: true,
    maxPurchaseQty: 1,
    estimatedDeliveryMinutes: null,
    supplierSku: null,
    supplierMetadata: {},
    version: 1,
    createdAt: SANDBOX_NOW,
    updatedAt: SANDBOX_NOW,
  },
];

function asProductRow(data: unknown): ProductRow {
  return data as ProductRow;
}

function asAssetRow(data: unknown): ProductAssetRow {
  return data as ProductAssetRow;
}

function requireStorage(supabase: DbClient): StorageAdapter {
  if (supabase.storage === undefined) {
    throw new AppError('STORAGE_UNAVAILABLE', 'Storage client is not configured', 500);
  }
  return supabase.storage;
}

function bucketForAsset(isPreview: boolean): string {
  return isPreview ? PRODUCT_PREVIEWS_BUCKET : PRODUCT_FILES_BUCKET;
}

/**
 * Loads one product by id from the sandbox catalog (Phase 0 orders).
 *
 * @param productId - Product UUID
 * @returns Matching product
 * @throws NotFoundError when the product is missing
 */
export function getProductById(productId: string): Product {
  const product = SANDBOX_PRODUCTS.find((item) => item.id === productId);
  if (!product) {
    throw new NotFoundError('product');
  }
  return product;
}

/**
 * Creates a draft product.
 *
 * @param supabase - Database client
 * @param input - Product fields; SKU must be unique
 * @returns Created product with status `draft`
 * @throws ValidationError when SKU is taken, wholesale is 0, or wholesale exceeds retail
 */
export async function createProduct(supabase: DbClient, input: CreateProductInput): Promise<Product> {
  if (input.wholesalePriceMinor <= 0n) {
    throw new ValidationError('INVALID_PRICE', 'Wholesale price must be greater than 0');
  }
  if (input.wholesalePriceMinor > input.retailPriceMinor) {
    throw new ValidationError('INVALID_PRICE', 'Wholesale price cannot exceed retail price');
  }

  const sku = input.sku.toUpperCase();
  const existing = await supabase.from('products').select('id').eq('sku', sku).maybeSingle();
  if (existing.error) {
    throw new AppError('PRODUCT_LOOKUP_FAILED', existing.error.message, 500);
  }
  if (existing.data !== null) {
    throw new ValidationError('SKU_TAKEN', 'SKU already exists');
  }

  const stockUnlimited = input.stockUnlimited ?? true;
  if (!stockUnlimited && (input.stockCount === undefined || input.stockCount <= 0)) {
    throw new ValidationError('INVALID_STOCK', 'Stock count is required when stock is limited');
  }

  if (input.deliveryType === 'supplier_api') {
    const sku = input.supplierSku?.trim() ?? '';
    if (sku.length === 0) {
      throw new ValidationError('SUPPLIER_SKU_REQUIRED', 'Supplier SKU is required for supplier API products');
    }
  }

  const { data, error } = await supabase
    .from('products')
    .insert({
      sku,
      title: input.title,
      description: input.description ?? null,
      category: input.category ?? null,
      delivery_type: input.deliveryType,
      status: 'draft',
      wholesale_price: input.wholesalePriceMinor.toString(),
      retail_price: input.retailPriceMinor.toString(),
      stock_unlimited: stockUnlimited,
      stock_count: stockUnlimited ? null : (input.stockCount ?? null),
      reseller_eligible: input.resellerEligible ?? true,
      max_purchase_qty: input.maxPurchaseQty ?? 1,
      estimated_delivery_minutes: input.estimatedDeliveryMinutes ?? null,
      supplier_sku: input.deliveryType === 'supplier_api' ? (input.supplierSku ?? null) : (input.supplierSku ?? null),
      supplier_metadata: input.supplierMetadata ?? {},
      version: 1,
    })
    .select('*')
    .single();

  if (error || data === null) {
    throw new AppError('PRODUCT_CREATE_FAILED', error?.message ?? 'Unable to create product', 500);
  }
  invalidateCache('published_products');
  invalidateCache('bot_products_');
  return mapProductRow(asProductRow(data));
}

/**
 * Loads a product by ID.
 *
 * @param supabase - Database client
 * @param productId - Product UUID
 * @throws NotFoundError if not found
 */
export async function getProduct(supabase: DbClient, productId: string): Promise<Product> {
  const { data, error } = await supabase.from('products').select('*').eq('id', productId).maybeSingle();
  if (error) {
    throw new AppError('PRODUCT_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null) {
    throw new NotFoundError('product');
  }
  return mapProductRow(asProductRow(data));
}

/**
 * Loads a product and all attached assets.
 *
 * @param supabase - Database client
 * @param productId - Product UUID
 */
export async function getProductWithAssets(
  supabase: DbClient,
  productId: string,
): Promise<ProductWithAssets> {
  const product = await getProduct(supabase, productId);
  const result = (await supabase
    .from('product_assets')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('ASSET_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return {
    ...product,
    assets: rows.map((row) => mapProductAssetRow(asAssetRow(row))),
  };
}

/**
 * Lists products for the owner, newest first.
 *
 * @param supabase - Database client
 * @param filters - Optional status and category filters
 */
export async function listProducts(
  supabase: DbClient,
  filters?: { status?: ProductStatus; category?: string },
): Promise<Product[]> {
  let query = supabase.from('products').select(PRODUCT_LIST_COLUMNS).order('created_at', { ascending: false });
  if (filters?.status !== undefined) {
    query = query.eq('status', filters.status);
  }
  if (filters?.category !== undefined) {
    query = query.eq('category', filters.category);
  }
  const result = (await query) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('PRODUCT_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((row) => mapProductRow(asProductRow(row)));
}

/**
 * Lists published products that resellers may add to their store.
 *
 * @param supabase - Database client
 */
export async function listPublishedProducts(supabase: DbClient): Promise<Product[]> {
  return withCache('published_products', 30_000, async () => {
    const published = await listProducts(supabase, { status: 'published' });
    return published.filter((product) => product.resellerEligible);
  });
}

/**
 * Partial product update. SKU cannot change after creation.
 * Increments version when price or delivery type changes.
 *
 * @param supabase - Database client
 * @param productId - Product UUID
 * @param input - Fields to update
 */
export async function updateProduct(
  supabase: DbClient,
  productId: string,
  input: UpdateProductInput,
): Promise<Product> {
  const existing = await getProduct(supabase, productId);

  const nextWholesale = input.wholesalePriceMinor ?? existing.wholesalePriceMinor;
  const nextRetail = input.retailPriceMinor ?? existing.retailPriceMinor;
  if (nextWholesale <= 0n) {
    throw new ValidationError('INVALID_PRICE', 'Wholesale price must be greater than 0');
  }
  if (nextWholesale > nextRetail) {
    throw new ValidationError('INVALID_PRICE', 'Wholesale price cannot exceed retail price');
  }

  const priceChanged =
    nextWholesale !== existing.wholesalePriceMinor || nextRetail !== existing.retailPriceMinor;
  const deliveryChanged =
    input.deliveryType !== undefined && input.deliveryType !== existing.deliveryType;
  const version = priceChanged || deliveryChanged ? existing.version + 1 : existing.version;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    version,
  };
  if (input.title !== undefined) {
    patch.title = input.title;
  }
  if (input.description !== undefined) {
    patch.description = input.description;
  }
  if (input.category !== undefined) {
    patch.category = input.category;
  }
  if (input.deliveryType !== undefined) {
    patch.delivery_type = input.deliveryType;
  }
  if (input.wholesalePriceMinor !== undefined) {
    patch.wholesale_price = input.wholesalePriceMinor.toString();
  }
  if (input.retailPriceMinor !== undefined) {
    patch.retail_price = input.retailPriceMinor.toString();
  }
  if (input.stockUnlimited !== undefined) {
    patch.stock_unlimited = input.stockUnlimited;
  }
  if (input.stockCount !== undefined) {
    patch.stock_count = input.stockCount;
  }
  if (input.resellerEligible !== undefined) {
    patch.reseller_eligible = input.resellerEligible;
  }
  if (input.maxPurchaseQty !== undefined) {
    patch.max_purchase_qty = input.maxPurchaseQty;
  }
  if (input.estimatedDeliveryMinutes !== undefined) {
    patch.estimated_delivery_minutes = input.estimatedDeliveryMinutes;
  }
  if (input.supplierSku !== undefined) {
    patch.supplier_sku = input.supplierSku;
  }
  if (input.supplierMetadata !== undefined) {
    patch.supplier_metadata = input.supplierMetadata;
  }
  if (input.status !== undefined) {
    patch.status = input.status;
  }

  const nextDelivery = input.deliveryType ?? existing.deliveryType;
  const nextSupplierSku = input.supplierSku !== undefined ? input.supplierSku : existing.supplierSku;
  if (nextDelivery === 'supplier_api' && (!nextSupplierSku || nextSupplierSku.trim().length === 0)) {
    throw new ValidationError('SUPPLIER_SKU_REQUIRED', 'Supplier SKU is required for supplier API products');
  }

  const { data, error } = await supabase
    .from('products')
    .update(patch)
    .eq('id', productId)
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('PRODUCT_UPDATE_FAILED', error?.message ?? 'Unable to update product', 500);
  }
  invalidateCache('published_products');
  invalidateCache('bot_products_');
  return mapProductRow(asProductRow(data));
}

function assertStatusTransition(current: ProductStatus, next: ProductStatus): void {
  if (current === 'archived') {
    throw new ValidationError('PRODUCT_ARCHIVED', 'Archived products cannot be restored');
  }
  if (next === 'archived') {
    return;
  }
  if (next === 'published' && (current === 'draft' || current === 'paused' || current === 'published')) {
    return;
  }
  if (next === 'paused' && (current === 'published' || current === 'paused' || current === 'draft')) {
    return;
  }
  if (next === 'draft') {
    throw new ValidationError('INVALID_STATUS', 'Products cannot return to draft');
  }
  throw new ValidationError('INVALID_STATUS', `Cannot change status from ${current} to ${next}`);
}

/**
 * Moves a product through its status lifecycle.
 * draft → published, published → paused, any → archived. Cannot un-archive.
 *
 * @param supabase - Database client
 * @param productId - Product UUID
 * @param status - Target status
 */
export async function updateProductStatus(
  supabase: DbClient,
  productId: string,
  status: ProductStatus,
): Promise<Product> {
  const existing = await getProduct(supabase, productId);
  assertStatusTransition(existing.status, status);
  return updateProduct(supabase, productId, { status });
}

/**
 * Records an uploaded file against a product and bumps the product version.
 *
 * @param supabase - Database client
 * @param productId - Product UUID
 * @param asset - Storage metadata after a successful upload
 */
export async function attachAsset(
  supabase: DbClient,
  productId: string,
  asset: {
    storagePath: string;
    contentType: string;
    fileSizeBytes: number | null;
    isPreview: boolean;
  },
): Promise<ProductAsset> {
  const product = await getProduct(supabase, productId);
  const { data, error } = await supabase
    .from('product_assets')
    .insert({
      product_id: productId,
      storage_path: asset.storagePath,
      content_type: asset.contentType,
      file_size_bytes: asset.fileSizeBytes,
      is_preview: asset.isPreview,
      version: product.version,
    })
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('ASSET_CREATE_FAILED', error?.message ?? 'Unable to attach asset', 500);
  }
  await supabase
    .from('products')
    .update({ version: product.version + 1, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .select('*')
    .single();
  return mapProductAssetRow(asAssetRow(data));
}

async function getAsset(supabase: DbClient, assetId: string): Promise<ProductAsset> {
  const { data, error } = await supabase.from('product_assets').select('*').eq('id', assetId).maybeSingle();
  if (error) {
    throw new AppError('ASSET_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null) {
    throw new NotFoundError('asset');
  }
  return mapProductAssetRow(asAssetRow(data));
}

/**
 * Removes an asset record and deletes the file from private storage.
 *
 * @param supabase - Database client with storage (service role)
 * @param assetId - Asset UUID
 */
export async function deleteAsset(supabase: DbClient, assetId: string): Promise<void> {
  const asset = await getAsset(supabase, assetId);
  const storage = requireStorage(supabase);
  const { error: storageError } = await storage.from(bucketForAsset(asset.isPreview)).remove([asset.storagePath]);
  if (storageError) {
    throw new AppError('STORAGE_DELETE_FAILED', storageError.message, 500);
  }
  const { error } = await supabase.from('product_assets').delete().eq('id', assetId).maybeSingle();
  if (error) {
    throw new AppError('ASSET_DELETE_FAILED', error.message, 500);
  }
}

/**
 * Creates a short-lived signed URL for a private product file.
 * Never returns the raw storage path.
 *
 * @param supabase - Database client with storage (service role)
 * @param assetId - Asset UUID
 * @param expiresInSeconds - TTL, default 1 hour
 */
export async function generateDownloadUrl(
  supabase: DbClient,
  assetId: string,
  expiresInSeconds: number = SIGNED_URL_DEFAULT_TTL_SECONDS,
): Promise<string> {
  const asset = await getAsset(supabase, assetId);
  const storage = requireStorage(supabase);
  const { data, error } = await storage
    .from(bucketForAsset(asset.isPreview))
    .createSignedUrl(asset.storagePath, expiresInSeconds);
  if (error || data === null) {
    throw new AppError('SIGNED_URL_FAILED', error?.message ?? 'Unable to create download URL', 500);
  }
  return data.signedUrl;
}

/**
 * Loads an asset used by download authorization (internal).
 *
 * @param supabase - Database client
 * @param assetId - Asset UUID
 */
export async function getProductAsset(supabase: DbClient, assetId: string): Promise<ProductAsset> {
  return getAsset(supabase, assetId);
}
