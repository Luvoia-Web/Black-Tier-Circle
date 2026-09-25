/**
 * @file modules/supplier/index.ts
 *
 * Sync, review, and publish supplier catalog rows.
 */

import { randomUUID } from 'node:crypto';
import { decrypt, encrypt } from '@/lib/encryption';
import { AppError, ValidationError } from '@/lib/errors';
import type { DbClient } from '@/lib/supabase/query';
import { adapterByName, testSupplierConnection } from '@/integrations/supplier/supplier-client';
import { createProdSellerClient } from '@/integrations/prodseller/client';
import { fulfillViaSupplier, loadSupplierClient, mapSupplierOrder, supplierCostMinor } from './place';

export { fulfillViaSupplier, mapSupplierOrder, supplierArtifact, supplierCostMinor, supplierOrderIdFromArtifact } from './place';
export { pollPendingSupplierOrders } from './poll';

export type SupplierRecord = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly baseUrl: string;
  readonly authHeaderName: string;
  readonly status: string;
  readonly balanceUsdt: string;
  readonly balanceCheckedAt: string | null;
  readonly membershipTier: string | null;
  readonly lastSyncAt: string | null;
  readonly lastSyncError: string | null;
  readonly productCount: number;
  readonly hasApiKey: boolean;
};

type SupplierDbRow = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly base_url: string;
  readonly api_key_encrypted: string | null;
  readonly auth_header_name: string;
  readonly status: string;
  readonly balance_usdt: string | number | null;
  readonly balance_checked_at: string | null;
  readonly membership_tier: string | null;
  readonly last_sync_at: string | null;
  readonly last_sync_error: string | null;
  readonly product_count: number | null;
};

export type SupplierProductRecord = {
  readonly id: string;
  readonly supplierId: string;
  readonly supplierSku: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly imageUrl: string | null;
  readonly supplierPrice: string;
  readonly supplierPublicPrice: string | null;
  readonly deliveryType: string;
  readonly requiresEmailActivation: boolean;
  readonly inStock: boolean;
  readonly reviewStatus: string;
  readonly wholesalePriceMinor: string | null;
  readonly retailPriceMinor: string | null;
  readonly productId: string | null;
};

type CatalogRow = {
  readonly id: string;
  readonly supplier_id: string;
  readonly supplier_sku: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly image_url: string | null;
  readonly supplier_price: string | number;
  readonly supplier_public_price: string | number | null;
  readonly delivery_type: string;
  readonly requires_email_activation: boolean;
  readonly in_stock: boolean;
  readonly review_status: string;
  readonly wholesale_price_minor: string | number | null;
  readonly retail_price_minor: string | number | null;
  readonly product_id: string | null;
};

function mapSupplier(row: SupplierDbRow): SupplierRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    baseUrl: row.base_url,
    authHeaderName: row.auth_header_name,
    status: row.status,
    balanceUsdt: String(row.balance_usdt ?? '0'),
    balanceCheckedAt: row.balance_checked_at,
    membershipTier: row.membership_tier,
    lastSyncAt: row.last_sync_at,
    lastSyncError: row.last_sync_error,
    productCount: row.product_count ?? 0,
    hasApiKey: Boolean(row.api_key_encrypted),
  };
}

function mapCatalog(row: CatalogRow): SupplierProductRecord {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierSku: row.supplier_sku,
    name: row.name,
    description: row.description,
    category: row.category,
    imageUrl: row.image_url,
    supplierPrice: String(row.supplier_price),
    supplierPublicPrice: row.supplier_public_price === null ? null : String(row.supplier_public_price),
    deliveryType: row.delivery_type,
    requiresEmailActivation: row.requires_email_activation,
    inStock: row.in_stock,
    reviewStatus: row.review_status,
    wholesalePriceMinor: row.wholesale_price_minor === null ? null : String(row.wholesale_price_minor),
    retailPriceMinor: row.retail_price_minor === null ? null : String(row.retail_price_minor),
    productId: row.product_id,
  };
}

export function assertPublishPrices(supplierCost: bigint, wholesale: bigint, retail: bigint): void {
  if (wholesale <= supplierCost) {
    throw new ValidationError('PRICE_BELOW_COST', 'Wholesale must be above the supplier cost');
  }
  if (retail < wholesale) {
    throw new ValidationError('RETAIL_BELOW_WHOLESALE', 'Retail must be at least the wholesale price');
  }
}

async function getSupplierRow(supabase: DbClient, supplierId: string): Promise<SupplierDbRow> {
  const { data, error } = await supabase.from('suppliers').select('*').eq('id', supplierId).maybeSingle();
  if (error) {
    throw new AppError('SUPPLIER_LOOKUP_FAILED', error.message, 500);
  }
  if (!data) {
    throw new AppError('SUPPLIER_NOT_FOUND', 'Supplier not found', 404);
  }
  return data as SupplierDbRow;
}

export async function listSuppliers(supabase: DbClient): Promise<SupplierRecord[]> {
  const { data, error } = await supabase.from('suppliers').select('*').order('name');
  if (error) {
    throw new AppError('SUPPLIER_LIST_FAILED', error.message, 500);
  }
  return ((data ?? []) as SupplierDbRow[]).map(mapSupplier);
}

export async function connectSupplier(
  supabase: DbClient,
  input: {
    readonly name: string;
    readonly slug: string;
    readonly apiKey: string;
    readonly endpoint?: string;
  },
): Promise<{
  supplier: SupplierRecord;
  balance: number;
  membership: string;
  username: string;
  productCount: number;
  warning: string | null;
}> {
  const probed = await testSupplierConnection(input.apiKey, input.endpoint);
  if (!probed.success) {
    throw new AppError('SUPPLIER_CONNECT_FAILED', probed.error ?? 'Could not connect. Check your API key and try again.', 400);
  }
  const now = new Date().toISOString();
  const payload = {
    name: input.name,
    slug: input.slug,
    base_url: probed.baseUrl,
    api_key_encrypted: encrypt(input.apiKey),
    auth_header_name: probed.authHeaderName,
    auth_header_format: probed.authHeaderFormat,
    adapter_name: probed.adapterName,
    products_endpoint: probed.productsEndpoint,
    orders_endpoint: probed.ordersEndpoint,
    balance_endpoint: probed.balanceEndpoint,
    api_version: probed.apiVersion,
    status: 'active',
    balance_usdt: probed.balance?.available ?? 0,
    balance_checked_at: now,
    membership_tier: probed.balance?.currency ?? 'USDT',
    product_count: probed.productCount ?? 0,
    updated_at: now,
  };
  const existing = await supabase.from('suppliers').select('id').eq('slug', input.slug).maybeSingle();
  const legacyPayload = {
    name: payload.name,
    slug: payload.slug,
    base_url: payload.base_url,
    api_key_encrypted: payload.api_key_encrypted,
    auth_header_name: payload.auth_header_name,
    status: payload.status,
    balance_usdt: payload.balance_usdt,
    balance_checked_at: payload.balance_checked_at,
    membership_tier: payload.membership_tier,
    product_count: payload.product_count,
    updated_at: payload.updated_at,
  };
  let saved = existing.data
    ? await supabase.from('suppliers').update(payload).eq('slug', input.slug).select('*').single()
    : await supabase.from('suppliers').insert(payload).select('*').single();
  if (saved.error && /adapter_name|auth_header_format|products_endpoint/.test(saved.error.message)) {
    saved = existing.data
      ? await supabase.from('suppliers').update(legacyPayload).eq('slug', input.slug).select('*').single()
      : await supabase.from('suppliers').insert(legacyPayload).select('*').single();
  }
  if (saved.error || !saved.data) {
    throw new AppError('SUPPLIER_SAVE_FAILED', saved.error?.message ?? 'Unable to save supplier', 500);
  }
  return {
    supplier: mapSupplier(saved.data as SupplierDbRow),
    balance: probed.balance?.available ?? 0,
    membership: probed.balance?.currency ?? 'USDT',
    username: probed.supplierName ?? 'Supplier',
    productCount: probed.productCount ?? 0,
    warning: probed.warning ?? null,
  };
}

export async function refreshSupplierBalance(
  supabase: DbClient,
  supplierId: string,
): Promise<{ balance: number; membership: string }> {
  const client = await loadSupplierClient(supabase, supplierId);
  const balance = await client.getBalance();
  const { error } = await supabase
    .from('suppliers')
    .update({
      balance_usdt: balance.balance,
      balance_checked_at: new Date().toISOString(),
      membership_tier: balance.membership,
      updated_at: new Date().toISOString(),
    })
    .eq('id', supplierId);
  if (error) {
    throw new AppError('SUPPLIER_BALANCE_FAILED', error.message, 500);
  }
  return { balance: balance.balance, membership: balance.membership };
}

function catalogDelivery(product: { readonly requiresEmailActivation: boolean }): 'instant' | 'email_activation' {
  return product.requiresEmailActivation ? 'email_activation' : 'instant';
}

export async function syncSupplierProducts(
  supabase: DbClient,
  supplierId: string,
): Promise<{
  synced: number;
  newProducts: number;
  updatedProducts: number;
  outOfStock: number;
  errors: string[];
}> {
  const supplier = await getSupplierRow(supabase, supplierId);
  if (!supplier.api_key_encrypted) {
    throw new AppError('SUPPLIER_NOT_CONFIGURED', 'Save an API key before syncing', 400);
  }
  const adapterName = (supplier as { adapter_name?: string }).adapter_name;
  const useLegacy = !adapterName || adapterName === 'prodseller' || adapterName === 'generic' && supplier.base_url.includes('prodseller');
  const remote = useLegacy
    ? (await createProdSellerClient(decrypt(supplier.api_key_encrypted), supplier.base_url, supplier.auth_header_name).listProducts()).map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        price: item.price,
        publicPrice: item.publicPrice,
        requiresEmailActivation: item.requiresEmailActivation,
        inStock: item.inStock,
        sold: item.sold,
      }))
    : (await adapterByName(adapterName).getProducts(decrypt(supplier.api_key_encrypted), supplier.base_url)).map((item) => ({
        id: item.externalId,
        name: item.title,
        description: item.description ?? '',
        imageUrl: item.imageUrl ?? null,
        price: item.price,
        publicPrice: item.price,
        requiresEmailActivation: item.deliveryType === 'email_activation',
        inStock: item.stock === 'unlimited' || item.stock > 0,
        sold: 0,
      }));
  const seen = new Set<string>();
  let newProducts = 0;
  let updatedProducts = 0;
  const errors: string[] = [];
  const now = new Date().toISOString();

  for (const item of remote) {
    seen.add(item.id);
    const existing = await supabase
      .from('supplier_products')
      .select('id, review_status')
      .eq('supplier_id', supplierId)
      .eq('supplier_sku', item.id)
      .maybeSingle();
    if (existing.error) {
      errors.push(existing.error.message);
      continue;
    }
    const patch = {
      name: item.name,
      description: item.description,
      image_url: item.imageUrl,
      supplier_price: item.price,
      supplier_public_price: item.publicPrice,
      delivery_type: catalogDelivery(item),
      requires_email_activation: item.requiresEmailActivation,
      in_stock: item.inStock,
      sold_count: item.sold,
      last_seen_at: now,
      last_synced_at: now,
    };
    if (existing.data) {
      const updated = await supabase.from('supplier_products').update(patch).eq('id', (existing.data as { id: string }).id);
      if (updated.error) {
        errors.push(updated.error.message);
      } else {
        updatedProducts += 1;
      }
    } else {
      const inserted = await supabase.from('supplier_products').insert({
        ...patch,
        supplier_id: supplierId,
        supplier_sku: item.id,
        review_status: 'pending_review',
        first_seen_at: now,
      });
      if (inserted.error) {
        errors.push(inserted.error.message);
      } else {
        newProducts += 1;
      }
    }
  }

  const current = await supabase.from('supplier_products').select('id, supplier_sku').eq('supplier_id', supplierId);
  let outOfStock = 0;
  for (const row of (current.data ?? []) as Array<{ id: string; supplier_sku: string }>) {
    if (!seen.has(row.supplier_sku)) {
      const hidden = await supabase.from('supplier_products').update({ in_stock: false, last_synced_at: now }).eq('id', row.id);
      if (!hidden.error) {
        outOfStock += 1;
      }
    }
  }

  await supabase
    .from('suppliers')
    .update({
      last_sync_at: now,
      last_sync_error: errors[0] ?? null,
      product_count: seen.size,
      updated_at: now,
    })
    .eq('id', supplierId);

  return { synced: seen.size, newProducts, updatedProducts, outOfStock, errors };
}

export async function listSupplierProducts(
  supabase: DbClient,
  filters: { readonly supplierId: string; readonly status?: string; readonly search?: string },
): Promise<SupplierProductRecord[]> {
  let query = supabase.from('supplier_products').select('*').eq('supplier_id', filters.supplierId).order('name');
  if (filters.status && filters.status !== 'all') {
    query = query.eq('review_status', filters.status);
  }
  const { data, error } = await query;
  if (error) {
    throw new AppError('SUPPLIER_PRODUCT_LIST_FAILED', error.message, 500);
  }
  const rows = ((data ?? []) as CatalogRow[]).map(mapCatalog);
  const search = filters.search?.trim().toLowerCase();
  if (!search) {
    return rows;
  }
  return rows.filter((row) => row.name.toLowerCase().includes(search) || row.supplierSku.toLowerCase().includes(search));
}

async function getCatalogRow(supabase: DbClient, id: string): Promise<CatalogRow> {
  const { data, error } = await supabase.from('supplier_products').select('*').eq('id', id).maybeSingle();
  if (error || !data) {
    throw new AppError('SUPPLIER_PRODUCT_NOT_FOUND', 'Supplier product not found', 404);
  }
  return data as CatalogRow;
}

export async function publishSupplierProduct(
  supabase: DbClient,
  supplierProductId: string,
  prices: { readonly wholesalePriceMinor: bigint; readonly retailPriceMinor: bigint },
): Promise<{ productId: string }> {
  const row = await getCatalogRow(supabase, supplierProductId);
  const cost = supplierCostMinor(String(row.supplier_price));
  assertPublishPrices(cost, prices.wholesalePriceMinor, prices.retailPriceMinor);
  const now = new Date().toISOString();
  let productId = row.product_id;
  const supplierFields = {
    delivery_type: 'supplier_api' as const,
    status: 'published' as const,
    wholesale_price: prices.wholesalePriceMinor.toString(),
    retail_price: prices.retailPriceMinor.toString(),
    stock_unlimited: true,
    stock_count: null,
    reseller_eligible: true,
    supplier_id: row.supplier_id,
    supplier_sku: row.supplier_sku,
    supplier_price_minor: cost.toString(),
    requires_email_activation: row.requires_email_activation,
    supplier_metadata: { requiresEmailActivation: row.requires_email_activation },
    updated_at: now,
  };
  if (!productId) {
    productId = randomUUID();
    const sku = `SUPPLIER-${row.supplier_sku}`.slice(0, 80);
    const inserted = await supabase.from('products').insert({
      id: productId,
      sku,
      title: row.name,
      description: row.description,
      category: row.category ?? 'Supplier',
      max_purchase_qty: 1,
      version: 1,
      created_at: now,
      ...supplierFields,
    });
    if (inserted.error) {
      throw new AppError('PRODUCT_CREATE_FAILED', inserted.error.message, 500);
    }
  } else {
    const updated = await supabase.from('products').update(supplierFields).eq('id', productId);
    if (updated.error) {
      throw new AppError('PRODUCT_UPDATE_FAILED', updated.error.message, 500);
    }
  }
  const linked = await supabase
    .from('supplier_products')
    .update({
      review_status: 'published',
      product_id: productId,
      wholesale_price_minor: prices.wholesalePriceMinor.toString(),
      retail_price_minor: prices.retailPriceMinor.toString(),
    })
    .eq('id', row.id);
  if (linked.error) {
    throw new AppError('SUPPLIER_PUBLISH_FAILED', linked.error.message, 500);
  }
  return { productId };
}

export async function updateSupplierProductPrices(
  supabase: DbClient,
  supplierProductId: string,
  prices: { readonly wholesalePriceMinor?: bigint; readonly retailPriceMinor?: bigint },
): Promise<void> {
  const row = await getCatalogRow(supabase, supplierProductId);
  const wholesale =
    prices.wholesalePriceMinor ??
    (row.wholesale_price_minor === null ? null : BigInt(row.wholesale_price_minor));
  const retail =
    prices.retailPriceMinor ?? (row.retail_price_minor === null ? null : BigInt(row.retail_price_minor));
  if (wholesale !== null && retail !== null) {
    assertPublishPrices(supplierCostMinor(String(row.supplier_price)), wholesale, retail);
  }
  const patch: Record<string, string> = {};
  if (prices.wholesalePriceMinor !== undefined) {
    patch.wholesale_price_minor = prices.wholesalePriceMinor.toString();
  }
  if (prices.retailPriceMinor !== undefined) {
    patch.retail_price_minor = prices.retailPriceMinor.toString();
  }
  const updated = await supabase.from('supplier_products').update(patch).eq('id', row.id);
  if (updated.error) {
    throw new AppError('SUPPLIER_PRICE_FAILED', updated.error.message, 500);
  }
  if (row.product_id && (prices.wholesalePriceMinor !== undefined || prices.retailPriceMinor !== undefined)) {
    const productPatch: Record<string, string> = { updated_at: new Date().toISOString() };
    if (prices.wholesalePriceMinor !== undefined) {
      productPatch.wholesale_price = prices.wholesalePriceMinor.toString();
    }
    if (prices.retailPriceMinor !== undefined) {
      productPatch.retail_price = prices.retailPriceMinor.toString();
    }
    await supabase.from('products').update(productPatch).eq('id', row.product_id);
  }
}

export async function setSupplierProductReview(
  supabase: DbClient,
  supplierProductId: string,
  status: 'rejected' | 'pending_review' | 'paused',
): Promise<void> {
  const row = await getCatalogRow(supabase, supplierProductId);
  const updated = await supabase.from('supplier_products').update({ review_status: status }).eq('id', row.id);
  if (updated.error) {
    throw new AppError('SUPPLIER_REVIEW_FAILED', updated.error.message, 500);
  }
  if (status === 'paused' && row.product_id) {
    await supabase.from('products').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('id', row.product_id);
  }
}

export async function pauseSupplierProduct(supabase: DbClient, supplierProductId: string): Promise<void> {
  await setSupplierProductReview(supabase, supplierProductId, 'paused');
}

export async function pendingReviewCount(supabase: DbClient): Promise<number> {
  const { data, error } = await supabase.from('supplier_products').select('id').eq('review_status', 'pending_review');
  if (error || !Array.isArray(data)) {
    return 0;
  }
  return data.length;
}

