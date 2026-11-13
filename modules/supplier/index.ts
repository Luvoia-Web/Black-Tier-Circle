/**
 * @file modules/supplier/index.ts
 *
 * Sync, review, and publish supplier catalog rows.
 */

import { randomUUID } from 'node:crypto';
import { decrypt, encrypt } from '@/lib/encryption';
import { AppError, ValidationError } from '@/lib/errors';
import type { DbClient } from '@/lib/supabase/query';
import type { CatalogSupplierProduct } from '@/integrations/supplier/adapter-types';
import { readCardHints } from '@/modules/catalog/card-text';
import { adapterByName, detectAdapter, testSupplierConnection } from '@/integrations/supplier/supplier-client';
import { createProdSellerClient } from '@/integrations/prodseller/client';
import { safeSupplierSyncMessage } from '@/lib/supplier-errors';
import {
  catalogWriteForChange,
  flushCatalogWrites,
  loadSyncPolicy,
  missingSyncColumn,
  normalizeLinkedProduct,
  notifyOwnerAutoPaused,
} from './catalog-sync';
import { priceWithRule, type MarkupSide } from './markup-rules';
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
  readonly stockCount: number | null;
  readonly soldCount: number;
  readonly durationText: string | null;
  readonly warrantyText: string | null;
  readonly typeLabel: string | null;
  readonly lastSyncedAt: string | null;
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
  readonly stock_count?: number | null;
  readonly sold_count?: number | null;
  readonly duration_text?: string | null;
  readonly warranty_text?: string | null;
  readonly type_label?: string | null;
  readonly last_synced_at?: string | null;
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

function mapCatalog(row: CatalogRow, linkedProductId: string | null = null): SupplierProductRecord {
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
    stockCount: row.stock_count === undefined || row.stock_count === null ? null : Number(row.stock_count),
    soldCount: Number(row.sold_count ?? 0),
    durationText: row.duration_text ?? null,
    warrantyText: row.warranty_text ?? null,
    typeLabel: row.type_label ?? null,
    lastSyncedAt: row.last_synced_at ?? null,
    reviewStatus: row.review_status,
    wholesalePriceMinor: row.wholesale_price_minor === null ? null : String(row.wholesale_price_minor),
    retailPriceMinor: row.retail_price_minor === null ? null : String(row.retail_price_minor),
    productId: row.product_id ?? linkedProductId,
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

const EXISTING_PAGE = 1000;
const INSERT_CHUNK = 100;
const UPDATE_BATCH = 20;
const OUT_OF_STOCK_CHUNK = 200;
const EMPTY_CATALOG_ERROR = 'Supplier returned no products';

type RemoteCatalogItem = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly imageUrl: string | null;
  readonly price: number;
  readonly publicPrice: number;
  readonly requiresEmailActivation: boolean;
  readonly inStock: boolean;
  readonly sold: number;
  readonly durationText: string | null;
  readonly warrantyText: string | null;
  readonly typeLabel: string | null;
};

type ExistingSupplierProduct = {
  readonly id: string;
  readonly supplier_sku: string;
  readonly review_status: string;
  readonly in_stock: boolean;
  readonly product_id: string | null;
  readonly supplier_price: string | number | null;
};

type SyncSummary = {
  synced: number;
  newProducts: number;
  updatedProducts: number;
  outOfStock: number;
  stockChanged: number;
  repriced: number;
  autoPaused: number;
  errors: string[];
};

function emptySync(partial: Omit<SyncSummary, 'stockChanged' | 'repriced' | 'autoPaused'>): SyncSummary {
  return { ...partial, stockChanged: 0, repriced: 0, autoPaused: 0 };
}

function chunkList<T>(items: readonly T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

function asRows<T>(result: unknown): { readonly data: T[]; readonly error: { message: string } | null } {
  const record = result as { data?: T[] | null; error?: { message: string } | null };
  return { data: record.data ?? [], error: record.error ?? null };
}

function asWrite(result: unknown): { readonly error: { message: string } | null } {
  const record = result as { error?: { message: string } | null };
  return { error: record.error ?? null };
}

function storedAdapterName(adapter: { readonly keyPrefix: string | null }): string {
  if (adapter.keyPrefix === 'psk_') {
    return 'prodseller';
  }
  if (adapter.keyPrefix === 'tgb_') {
    return 'canboso';
  }
  return 'generic';
}

function prefersProdSeller(adapterName: string, baseUrl: string, apiKey: string): boolean {
  if (apiKey.startsWith('psk_')) {
    return true;
  }
  if (adapterName === 'prodseller') {
    return true;
  }
  return adapterName === 'generic' && baseUrl.includes('prodseller');
}

function mapAdapterProduct(item: CatalogSupplierProduct): RemoteCatalogItem {
  return {
    id: item.externalId,
    name: item.title,
    description: item.description ?? '',
    imageUrl: item.imageUrl ?? null,
    price: item.price,
    publicPrice: item.price,
    requiresEmailActivation: item.deliveryType === 'email_activation',
    inStock: item.stock === 'unlimited' || item.stock > 0,
    sold: 0,
    durationText: item.durationText ?? null,
    warrantyText: item.warrantyText ?? null,
    typeLabel: item.typeLabel ?? null,
  };
}

function cardFields(item: object): Pick<RemoteCatalogItem, 'durationText' | 'warrantyText' | 'typeLabel'> {
  const hints = readCardHints(item);
  const row = item as { durationText?: string | null; warrantyText?: string | null; typeLabel?: string | null };
  return {
    durationText: row.durationText ?? hints.durationText,
    warrantyText: row.warrantyText ?? hints.warrantyText,
    typeLabel: row.typeLabel ?? hints.typeLabel,
  };
}

function stripCardColumns(patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...patch };
  delete next.duration_text;
  delete next.warranty_text;
  delete next.type_label;
  return next;
}

function cardColumnMissing(message: string): boolean {
  return /duration_text|warranty_text|type_label/i.test(message);
}

async function insertSupplierChunk(supabase: DbClient, rows: Record<string, unknown>[]): Promise<string | null> {
  const first = asWrite(await supabase.from('supplier_products').insert(rows));
  if (first.error && cardColumnMissing(first.error.message)) {
    const second = asWrite(await supabase.from('supplier_products').insert(rows.map((row) => stripCardColumns(row))));
    return second.error ? safeSupplierSyncMessage(second.error.message) : null;
  }
  return first.error ? safeSupplierSyncMessage(first.error.message) : null;
}

async function updateSupplierRow(supabase: DbClient, id: string, patch: Record<string, unknown>): Promise<string | null> {
  const first = asWrite(await supabase.from('supplier_products').update(patch).eq('id', id));
  if (first.error && cardColumnMissing(first.error.message)) {
    const second = asWrite(await supabase.from('supplier_products').update(stripCardColumns(patch)).eq('id', id));
    return second.error ? safeSupplierSyncMessage(second.error.message) : null;
  }
  return first.error ? safeSupplierSyncMessage(first.error.message) : null;
}

function catalogPatch(item: RemoteCatalogItem, now: string): Record<string, unknown> {
  return {
    name: item.name,
    description: item.description,
    image_url: item.imageUrl,
    supplier_price: item.price,
    supplier_public_price: item.publicPrice,
    delivery_type: catalogDelivery(item),
    requires_email_activation: item.requiresEmailActivation,
    in_stock: item.inStock,
    sold_count: item.sold,
    ...(item.durationText ? { duration_text: item.durationText } : {}),
    ...(item.warrantyText ? { warranty_text: item.warrantyText } : {}),
    ...(item.typeLabel ? { type_label: item.typeLabel } : {}),
    last_seen_at: now,
    last_synced_at: now,
  };
}

async function loadRemoteCatalog(
  supplier: SupplierDbRow,
  apiKey: string,
): Promise<{ readonly items: RemoteCatalogItem[]; readonly detectedName: string | null }> {
  const rawName = (supplier as { adapter_name?: string | null }).adapter_name;
  const adapterName = typeof rawName === 'string' ? rawName.trim() : '';
  if (adapterName === '') {
    const detected = detectAdapter(apiKey);
    const detectedName = storedAdapterName(detected);
    if (prefersProdSeller(detectedName, supplier.base_url, apiKey)) {
      const listed = await createProdSellerClient(apiKey, supplier.base_url, supplier.auth_header_name).listProducts();
      return {
        detectedName,
        items: listed.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          imageUrl: item.imageUrl,
          price: item.price,
          publicPrice: item.publicPrice,
          requiresEmailActivation: item.requiresEmailActivation,
          inStock: item.inStock,
          sold: item.sold,
          ...cardFields(item),
        })),
      };
    }
    const products = await detected.getProducts(apiKey, supplier.base_url);
    return { detectedName, items: products.map(mapAdapterProduct) };
  }
  if (prefersProdSeller(adapterName, supplier.base_url, apiKey)) {
    const listed = await createProdSellerClient(apiKey, supplier.base_url, supplier.auth_header_name).listProducts();
    return {
      detectedName: null,
      items: listed.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        price: item.price,
        publicPrice: item.publicPrice,
        requiresEmailActivation: item.requiresEmailActivation,
        inStock: item.inStock,
        sold: item.sold,
        ...cardFields(item),
      })),
    };
  }
  const products = await adapterByName(adapterName).getProducts(apiKey, supplier.base_url);
  return { detectedName: null, items: products.map(mapAdapterProduct) };
}

async function loadExistingProducts(
  supabase: DbClient,
  supplierId: string,
): Promise<Map<string, ExistingSupplierProduct>> {
  const found = new Map<string, ExistingSupplierProduct>();
  let offset = 0;
  let previousFirstId = '';
  for (;;) {
    const page = asRows<ExistingSupplierProduct>(
      await supabase
        .from('supplier_products')
        .select('id, supplier_sku, review_status, in_stock, product_id, supplier_price')
        .eq('supplier_id', supplierId)
        .order('id')
        .range(offset, offset + EXISTING_PAGE - 1),
    );
    if (page.error) {
      throw new AppError('SUPPLIER_SYNC_FAILED', safeSupplierSyncMessage(page.error.message), 500);
    }
    const first = page.data[0];
    if (page.data.length === EXISTING_PAGE && first && first.id === previousFirstId) {
      break;
    }
    for (const row of page.data) {
      found.set(row.supplier_sku, row);
    }
    if (page.data.length < EXISTING_PAGE) {
      break;
    }
    previousFirstId = first?.id ?? '';
    offset += EXISTING_PAGE;
  }
  return found;
}

async function rememberDetectedAdapter(
  supabase: DbClient,
  supplierId: string,
  detectedName: string,
  now: string,
  errors: string[],
): Promise<void> {
  try {
    const saved = asWrite(
      await supabase.from('suppliers').update({ adapter_name: detectedName, updated_at: now }).eq('id', supplierId),
    );
    if (saved.error && !/adapter_name/i.test(saved.error.message)) {
      errors.push(safeSupplierSyncMessage(saved.error.message));
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (!/adapter_name/i.test(message)) {
      errors.push(safeSupplierSyncMessage(error));
    }
  }
}

export async function syncSupplierProducts(
  supabase: DbClient,
  supplierId: string,
): Promise<SyncSummary> {
  const supplier = await getSupplierRow(supabase, supplierId);
  if (!supplier.api_key_encrypted) {
    throw new AppError('SUPPLIER_NOT_CONFIGURED', 'Save an API key before syncing', 400);
  }
  const apiKey = decrypt(supplier.api_key_encrypted);
  const loaded = await loadRemoteCatalog(supplier, apiKey);
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const remote: RemoteCatalogItem[] = [];
  for (const item of loaded.items) {
    if (item.id.trim().length === 0 || seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    remote.push(item);
  }

  if (remote.length === 0) {
    try {
      await supabase
        .from('suppliers')
        .update({ last_sync_error: EMPTY_CATALOG_ERROR, updated_at: now })
        .eq('id', supplierId);
    } catch {
      // The empty catalog is still reported below. Nothing is marked out of stock.
    }
    return emptySync({ synced: 0, newProducts: 0, updatedProducts: 0, outOfStock: 0, errors: [EMPTY_CATALOG_ERROR] });
  }

  const existing = await loadExistingProducts(supabase, supplierId);
  const toInsert: RemoteCatalogItem[] = [];
  const toUpdate: RemoteCatalogItem[] = [];
  for (const item of remote) {
    if (existing.has(item.id)) {
      toUpdate.push(item);
    } else {
      toInsert.push(item);
    }
  }

  let newProducts = 0;
  let updatedProducts = 0;
  const errors: string[] = [];
  const updatedItems: RemoteCatalogItem[] = [];

  // The table has unique (supplier_id, supplier_sku). Upsert is not used:
  // a payload that sets review_status for new rows would also reset it on existing rows.
  for (const chunk of chunkList(toInsert, INSERT_CHUNK)) {
    try {
      const inserted = await insertSupplierChunk(
        supabase,
        chunk.map((item) => ({
          ...catalogPatch(item, now),
          supplier_id: supplierId,
          supplier_sku: item.id,
          review_status: 'pending_review',
          first_seen_at: now,
        })),
      );
      if (inserted) {
        errors.push(inserted);
      } else {
        newProducts += chunk.length;
      }
    } catch (error: unknown) {
      errors.push(safeSupplierSyncMessage(error));
    }
  }

  for (const batch of chunkList(toUpdate, UPDATE_BATCH)) {
    const outcomes = await Promise.all(
      batch.map(async (item) => {
        const row = existing.get(item.id);
        if (!row) {
          return 'Missing supplier product row';
        }
        try {
          return await updateSupplierRow(supabase, row.id, catalogPatch(item, now));
        } catch (error: unknown) {
          return safeSupplierSyncMessage(error);
        }
      }),
    );
    outcomes.forEach((outcome, index) => {
      if (outcome) {
        errors.push(outcome);
      } else {
        updatedProducts += 1;
        const item = batch[index];
        if (item) {
          updatedItems.push(item);
        }
      }
    });
  }

  const staleIds: string[] = [];
  for (const row of existing.values()) {
    if (row.in_stock === true && !seen.has(row.supplier_sku)) {
      staleIds.push(row.id);
    }
  }
  let outOfStock = 0;
  const hiddenIds: string[] = [];
  for (const chunk of chunkList(staleIds, OUT_OF_STOCK_CHUNK)) {
    try {
      const hidden = asWrite(
        await supabase
          .from('supplier_products')
          .update({ in_stock: false, last_synced_at: now })
          .in('id', chunk),
      );
      if (hidden.error) {
        errors.push(safeSupplierSyncMessage(hidden.error.message));
      } else {
        outOfStock += chunk.length;
        hiddenIds.push(...chunk);
      }
    } catch (error: unknown) {
      errors.push(safeSupplierSyncMessage(error));
    }
  }

  if (loaded.detectedName) {
    await rememberDetectedAdapter(supabase, supplierId, loaded.detectedName, now, errors);
  }

  try {
    await supabase
      .from('suppliers')
      .update({
        last_sync_at: now,
        last_sync_error: errors[0] ?? null,
        product_count: seen.size,
        updated_at: now,
      })
      .eq('id', supplierId);
  } catch (error: unknown) {
    errors.push(safeSupplierSyncMessage(error));
  }

  const catalog = await writeCatalogChanges(supabase, supplierId, existing, updatedItems, hiddenIds, now, errors);

  return {
    synced: seen.size,
    newProducts,
    updatedProducts,
    outOfStock,
    stockChanged: catalog.stockChanged,
    repriced: catalog.repriced,
    autoPaused: catalog.autoPaused,
    errors,
  };
}

const LINKED_COLUMNS =
  'id, supplier_price_minor, retail_price, wholesale_price, pricing_mode, markup_percent, supplier_in_stock, status, version, auto_paused_reason';
const LINKED_MARKUP_COLUMNS =
  ', wholesale_markup_kind, wholesale_markup_percent, wholesale_markup_minor, retail_markup_kind, retail_markup_percent, retail_markup_minor';

async function loadLinkedCatalog(
  supabase: DbClient,
  supplierId: string,
): Promise<Map<string, ReturnType<typeof normalizeLinkedProduct>>> {
  const found = new Map<string, ReturnType<typeof normalizeLinkedProduct>>();
  let offset = 0;
  let includeMarkup = true;
  for (;;) {
    const page = asRows<{ id: string; retail_price: string | number; wholesale_price: string | number }>(
      await supabase
        .from('products')
        .select(includeMarkup ? `${LINKED_COLUMNS}${LINKED_MARKUP_COLUMNS}` : LINKED_COLUMNS)
        .eq('supplier_id', supplierId)
        .order('id')
        .range(offset, offset + EXISTING_PAGE - 1),
    );
    if (page.error) {
      if (includeMarkup && missingSyncColumn(page.error.message)) {
        includeMarkup = false;
        continue;
      }
      if (missingSyncColumn(page.error.message)) {
        return found;
      }
      throw new AppError('SUPPLIER_SYNC_FAILED', safeSupplierSyncMessage(page.error.message), 500);
    }
    for (const row of page.data) {
      found.set(row.id, normalizeLinkedProduct(row));
    }
    if (page.data.length < EXISTING_PAGE) {
      break;
    }
    offset += EXISTING_PAGE;
  }
  return found;
}

async function writeCatalogChanges(
  supabase: DbClient,
  supplierId: string,
  existing: Map<string, ExistingSupplierProduct>,
  updatedItems: readonly RemoteCatalogItem[],
  hiddenIds: readonly string[],
  now: string,
  errors: string[],
): Promise<{ stockChanged: number; repriced: number; autoPaused: number }> {
  const none = { stockChanged: 0, repriced: 0, autoPaused: 0 };
  let linked: Map<string, ReturnType<typeof normalizeLinkedProduct>>;
  try {
    linked = await loadLinkedCatalog(supabase, supplierId);
  } catch (error: unknown) {
    errors.push(safeSupplierSyncMessage(error));
    return none;
  }
  if (linked.size === 0) {
    return none;
  }
  const policy = await loadSyncPolicy(supabase);
  const writes = [];
  for (const item of updatedItems) {
    const row = existing.get(item.id);
    const product = row?.product_id ? linked.get(row.product_id) : undefined;
    if (!product) {
      continue;
    }
    let costMinor: bigint | null = null;
    try {
      costMinor = supplierCostMinor(item.price);
    } catch {
      costMinor = null;
    }
    const write = catalogWriteForChange({
      product,
      name: item.name,
      inStock: item.inStock,
      costMinor,
      policy,
      considerCost: costMinor !== null,
    });
    if (write) {
      writes.push(write);
    }
  }
  const hidden = new Set(hiddenIds);
  for (const row of existing.values()) {
    if (!hidden.has(row.id) || !row.product_id) {
      continue;
    }
    const product = linked.get(row.product_id);
    if (!product) {
      continue;
    }
    const write = catalogWriteForChange({
      product,
      name: row.supplier_sku,
      inStock: false,
      costMinor: null,
      policy,
      considerCost: false,
    });
    if (write) {
      writes.push(write);
    }
  }
  try {
    const flushed = await flushCatalogWrites(supabase, writes, now);
    errors.push(...flushed.errors.map((message) => safeSupplierSyncMessage(message)));
    const notices = flushed.notices.filter((notice): notice is NonNullable<typeof notice> => notice !== null);
    if (notices.length > 0) {
      await notifyOwnerAutoPaused(supabase, notices);
    }
    return { stockChanged: flushed.stockChanged, repriced: flushed.repriced, autoPaused: flushed.autoPaused };
  } catch (error: unknown) {
    errors.push(safeSupplierSyncMessage(error));
    return none;
  }
}

const STATUS_KEYS = ['pending_review', 'published', 'rejected', 'paused'] as const;
const LIST_PAGE_MAX = 96;
const RANGE_PAGE = 1000;

export type SupplierCatalogQuery = {
  readonly supplierId: string;
  readonly page?: number;
  readonly limit?: number;
  readonly status?: string;
  readonly search?: string;
  readonly sort?: 'name' | 'cost' | 'stock' | 'synced';
  readonly stock?: 'all' | 'in' | 'out';
  readonly pushed?: 'all' | 'published' | 'not_published';
};

export type SupplierCatalogPage = {
  readonly products: SupplierProductRecord[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly counts: Record<(typeof STATUS_KEYS)[number], number>;
};

type ListedResult = {
  readonly data: CatalogRow[] | null;
  readonly error: { message: string } | null;
  readonly count?: number | null;
};

function sortColumn(sort: SupplierCatalogQuery['sort']): { column: string; ascending: boolean } {
  if (sort === 'cost') {
    return { column: 'supplier_price', ascending: false };
  }
  if (sort === 'stock') {
    return { column: 'stock_count', ascending: false };
  }
  if (sort === 'synced') {
    return { column: 'last_synced_at', ascending: false };
  }
  return { column: 'name', ascending: true };
}

function applyListFilters(
  supabase: DbClient,
  filters: SupplierCatalogQuery,
): ReturnType<DbClient['from']> {
  let query = supabase.from('supplier_products').select('*').eq('supplier_id', filters.supplierId);
  if (filters.status && filters.status !== 'all') {
    query = query.eq('review_status', filters.status);
  }
  if (filters.stock === 'in' || filters.stock === 'out') {
    query = query.eq('in_stock', filters.stock === 'in');
  }
  const search = filters.search?.trim().replace(/[%_,]/g, '') ?? '';
  if (search) {
    query = query.or(`name.ilike.%${search}%,supplier_sku.ilike.%${search}%`);
  }
  return query;
}

async function linkedCatalog(supabase: DbClient, supplierId: string): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  let offset = 0;
  for (;;) {
    const page = (await supabase
      .from('products')
      .select('id, supplier_sku')
      .eq('supplier_id', supplierId)
      .order('id')
      .range(offset, offset + RANGE_PAGE - 1)) as ListedResult;
    if (page.error) {
      return found;
    }
    const rows = page.data ?? [];
    for (const row of rows) {
      const sku = (row as { supplier_sku?: string | null }).supplier_sku;
      const id = (row as { id?: string }).id;
      if (sku && id) {
        found.set(sku, id);
      }
    }
    if (rows.length < RANGE_PAGE) {
      break;
    }
    offset += RANGE_PAGE;
  }
  return found;
}

async function statusCounts(
  supabase: DbClient,
  supplierId: string,
): Promise<SupplierCatalogPage['counts']> {
  const counts = { pending_review: 0, published: 0, rejected: 0, paused: 0 };
  await Promise.all(
    STATUS_KEYS.map(async (status) => {
      const result = (await supabase
        .from('supplier_products')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_id', supplierId)
        .eq('review_status', status)) as ListedResult;
      counts[status] = result.error ? 0 : (result.count ?? 0);
    }),
  );
  return counts;
}

export async function listSupplierProducts(
  supabase: DbClient,
  filters: SupplierCatalogQuery,
): Promise<SupplierCatalogPage> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(LIST_PAGE_MAX, Math.max(1, filters.limit ?? 24));
  const offset = (page - 1) * limit;
  const ordering = sortColumn(filters.sort);
  const [links, counts] = await Promise.all([
    linkedCatalog(supabase, filters.supplierId),
    statusCounts(supabase, filters.supplierId),
  ]);
  const pushed = filters.pushed ?? 'all';
  if (pushed === 'all') {
    const result = (await applyListFilters(supabase, filters)
      .order(ordering.column, { ascending: ordering.ascending })
      .range(offset, offset + limit - 1)) as ListedResult & { count?: number | null };
    if (result.error) {
      throw new AppError('SUPPLIER_PRODUCT_LIST_FAILED', result.error.message, 500);
    }
    const counted = (await applyListFilters(supabase, filters).select('*', { count: 'exact', head: true })) as ListedResult;
    return {
      products: (result.data ?? []).map((row) => mapCatalog(row, links.get(row.supplier_sku) ?? null)),
      total: counted.count ?? result.data?.length ?? 0,
      page,
      limit,
      counts,
    };
  }
  const matched: CatalogRow[] = [];
  let cursor = 0;
  for (;;) {
    const chunk = (await applyListFilters(supabase, filters)
      .order(ordering.column, { ascending: ordering.ascending })
      .range(cursor, cursor + RANGE_PAGE - 1)) as ListedResult;
    if (chunk.error) {
      throw new AppError('SUPPLIER_PRODUCT_LIST_FAILED', chunk.error.message, 500);
    }
    const rows = chunk.data ?? [];
    for (const row of rows) {
      const isPushed = links.has(row.supplier_sku);
      if (pushed === 'published' ? isPushed : !isPushed) {
        matched.push(row);
      }
    }
    if (rows.length < RANGE_PAGE) {
      break;
    }
    cursor += RANGE_PAGE;
  }
  return {
    products: matched.slice(offset, offset + limit).map((row) => mapCatalog(row, links.get(row.supplier_sku) ?? null)),
    total: matched.length,
    page,
    limit,
    counts,
  };
}

async function getCatalogRow(supabase: DbClient, id: string): Promise<CatalogRow> {
  const { data, error } = await supabase.from('supplier_products').select('*').eq('id', id).maybeSingle();
  if (error || !data) {
    throw new AppError('SUPPLIER_PRODUCT_NOT_FOUND', 'Supplier product not found', 404);
  }
  return data as CatalogRow;
}

const PUBLISH_BATCH_LIMIT = 200;

function markupColumns(prefix: 'wholesale' | 'retail', rule: MarkupSide): Record<string, string | number | null> {
  return {
    [`${prefix}_markup_kind`]: rule.kind,
    [`${prefix}_markup_percent`]: rule.kind === 'percent' ? rule.percent : null,
    [`${prefix}_markup_minor`]: rule.kind === 'fixed' && rule.minor !== null ? rule.minor.toString() : null,
  };
}

export async function publishSupplierProduct(
  supabase: DbClient,
  supplierProductId: string,
  input: {
    readonly wholesalePriceMinor?: bigint;
    readonly retailPriceMinor?: bigint;
    readonly markupPercent?: number;
    readonly wholesaleRule?: MarkupSide;
    readonly retailRule?: MarkupSide;
    readonly buyerCategory?: string | null;
  },
): Promise<{ productId: string }> {
  const row = await getCatalogRow(supabase, supplierProductId);
  const cost = supplierCostMinor(String(row.supplier_price));
  const hasPrices = input.wholesalePriceMinor !== undefined && input.retailPriceMinor !== undefined;
  const hasMarkup = input.markupPercent !== undefined;
  const hasRules = input.wholesaleRule !== undefined && input.retailRule !== undefined;
  if (Number(hasPrices) + Number(hasMarkup) + Number(hasRules) !== 1) {
    throw new ValidationError('PUBLISH_PRICE_REQUIRED', 'Provide wholesale and retail prices, or a markup rule');
  }
  const pricingMode = hasPrices ? 'manual' : 'markup';
  const wholesaleRule = hasRules
    ? input.wholesaleRule
    : hasMarkup
      ? { kind: 'percent' as const, percent: input.markupPercent ?? 0, minor: null }
      : null;
  const retailRule = hasRules
    ? input.retailRule
    : hasMarkup
      ? { kind: 'percent' as const, percent: input.markupPercent ?? 0, minor: null }
      : null;
  const wholesale = wholesaleRule ? priceWithRule(cost, wholesaleRule) : (input.wholesalePriceMinor as bigint);
  const retail = retailRule ? priceWithRule(cost, retailRule) : (input.retailPriceMinor as bigint);
  assertPublishPrices(cost, wholesale, retail);
  const now = new Date().toISOString();
  let productId = row.product_id;
  const supplierFields = {
    delivery_type: 'supplier_api' as const,
    status: 'published' as const,
    wholesale_price: wholesale.toString(),
    retail_price: retail.toString(),
    stock_unlimited: true,
    stock_count: null,
    reseller_eligible: true,
    supplier_id: row.supplier_id,
    supplier_sku: row.supplier_sku,
    supplier_price_minor: cost.toString(),
    pricing_mode: pricingMode,
    markup_percent: hasMarkup ? input.markupPercent : null,
    ...(wholesaleRule ? markupColumns('wholesale', wholesaleRule) : {}),
    ...(retailRule ? markupColumns('retail', retailRule) : {}),
    supplier_in_stock: row.in_stock !== false,
    requires_email_activation: row.requires_email_activation,
    supplier_metadata: {
      requiresEmailActivation: row.requires_email_activation,
      ...(row.duration_text ? { duration: row.duration_text } : {}),
      ...(row.warranty_text ? { warranty: row.warranty_text } : {}),
      ...(row.type_label ? { typeLabel: row.type_label } : {}),
    },
    ...(row.category ? { category: row.category } : {}),
    ...(input.buyerCategory ? { buyer_category: input.buyerCategory } : {}),
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
      category: row.category,
      max_purchase_qty: 1,
      version: 1,
      created_at: now,
      ...supplierFields,
    });
    if (inserted.error) {
      throw new AppError('PRODUCT_CREATE_FAILED', inserted.error.message, 500);
    }
  } else {
    const updated = await supabase.from('products').update({
      ...supplierFields,
      title: row.name,
      description: row.description,
    }).eq('id', productId);
    if (updated.error) {
      throw new AppError('PRODUCT_UPDATE_FAILED', updated.error.message, 500);
    }
  }
  const linked = await supabase
    .from('supplier_products')
    .update({
      review_status: 'published',
      product_id: productId,
      wholesale_price_minor: wholesale.toString(),
      retail_price_minor: retail.toString(),
    })
    .eq('id', row.id);
  if (linked.error) {
    throw new AppError('SUPPLIER_PUBLISH_FAILED', linked.error.message, 500);
  }
  return { productId };
}

export async function bulkPublishSupplierProducts(
  supabase: DbClient,
  input: {
    readonly supplierProductIds: readonly string[];
    readonly markupPercent?: number;
    readonly wholesaleRule?: MarkupSide;
    readonly retailRule?: MarkupSide;
    readonly buyerCategory?: string | null;
  },
): Promise<{ results: Array<{ id: string; ok: boolean; productId?: string; error?: string }> }> {
  if (input.supplierProductIds.length === 0) {
    throw new ValidationError('PUBLISH_IDS_REQUIRED', 'Choose at least one supplier product');
  }
  if (input.supplierProductIds.length > PUBLISH_BATCH_LIMIT) {
    throw new ValidationError('PUBLISH_BATCH_TOO_LARGE', 'Publish at most 200 products at a time');
  }
  const policy = await loadSyncPolicy(supabase);
  const markup = input.markupPercent ?? policy.defaultMarkupPercent;
  const results: Array<{ id: string; ok: boolean; productId?: string; error?: string }> = [];
  for (const id of input.supplierProductIds) {
    try {
      const published = await publishSupplierProduct(supabase, id, {
        ...(input.wholesaleRule && input.retailRule
          ? { wholesaleRule: input.wholesaleRule, retailRule: input.retailRule }
          : { markupPercent: markup }),
        ...(input.buyerCategory ? { buyerCategory: input.buyerCategory } : {}),
      });
      results.push({ id, ok: true, productId: published.productId });
    } catch (error: unknown) {
      results.push({
        id,
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to publish',
      });
    }
  }
  return { results };
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

