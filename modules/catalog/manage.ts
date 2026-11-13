/**
 * Owner product removal, bulk actions, and a paged catalog list.
 * A product with orders is archived. A product with none is deleted.
 */

import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import type { DbClient } from '@/lib/supabase/query';
import { mapProductRow } from './map';
import { getProduct, updateProduct, updateProductStatus } from './index';
import type { Product, ProductRow, ProductStatus } from './types';
import { isListedInBot } from './visibility';

export { isListedInBot };

const PAGE_MAX = 96;

export type OwnerListQuery = {
  readonly page?: number;
  readonly limit?: number;
  readonly status?: ProductStatus | 'all';
  readonly category?: string;
  readonly supplierId?: string;
  readonly stock?: 'all' | 'in' | 'out';
  readonly search?: string;
  readonly sort?: 'title' | 'retail' | 'stock' | 'created';
};

export type OwnerProduct = Product & {
  readonly pricingMode: string;
  readonly wholesaleMarkupKind: string | null;
  readonly wholesaleMarkupPercent: number | null;
  readonly wholesaleMarkupMinor: string | null;
  readonly retailMarkupKind: string | null;
  readonly retailMarkupPercent: number | null;
  readonly retailMarkupMinor: string | null;
};

export type OwnerListPage = {
  readonly products: OwnerProduct[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly counts: Record<ProductStatus, number>;
};

function listedProduct(row: ProductRow): OwnerProduct {
  const extra = row as ProductRow & Record<string, unknown>;
  const percent = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    ...mapProductRow(row),
    pricingMode: extra.pricing_mode === 'markup' ? 'markup' : 'manual',
    wholesaleMarkupKind: typeof extra.wholesale_markup_kind === 'string' ? extra.wholesale_markup_kind : null,
    wholesaleMarkupPercent: percent(extra.wholesale_markup_percent),
    wholesaleMarkupMinor: extra.wholesale_markup_minor === null || extra.wholesale_markup_minor === undefined ? null : String(extra.wholesale_markup_minor),
    retailMarkupKind: typeof extra.retail_markup_kind === 'string' ? extra.retail_markup_kind : null,
    retailMarkupPercent: percent(extra.retail_markup_percent),
    retailMarkupMinor: extra.retail_markup_minor === null || extra.retail_markup_minor === undefined ? null : String(extra.retail_markup_minor),
  };
}

type Listed = {
  readonly data: ProductRow[] | null;
  readonly error: { message: string } | null;
  readonly count?: number | null;
};

function sortColumn(sort: OwnerListQuery['sort']): { column: string; ascending: boolean } {
  if (sort === 'retail') {
    return { column: 'retail_price', ascending: false };
  }
  if (sort === 'stock') {
    return { column: 'stock_count', ascending: false };
  }
  if (sort === 'created') {
    return { column: 'created_at', ascending: false };
  }
  return { column: 'title', ascending: true };
}

function filtered(supabase: DbClient, query: OwnerListQuery) {
  let request = supabase.from('products').select('*');
  if (query.status && query.status !== 'all') {
    request = request.eq('status', query.status);
  }
  if (query.category) {
    request = request.eq('category', query.category);
  }
  if (query.supplierId) {
    request = request.eq('supplier_id', query.supplierId);
  }
  const search = query.search?.trim().replace(/[%_,]/g, '') ?? '';
  if (search) {
    request = request.or(`title.ilike.%${search}%,sku.ilike.%${search}%`);
  }
  return request;
}

function inStock(row: ProductRow): boolean {
  if (row.supplier_in_stock === false) {
    return false;
  }
  return row.stock_unlimited || (row.stock_count ?? 0) > 0;
}

export async function listOwnerProducts(supabase: DbClient, query: OwnerListQuery): Promise<OwnerListPage> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, query.limit ?? 24));
  const offset = (page - 1) * limit;
  const ordering = sortColumn(query.sort);
  const counts = { draft: 0, published: 0, paused: 0, archived: 0 };
  await Promise.all(
    (Object.keys(counts) as ProductStatus[]).map(async (status) => {
      const result = (await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('status', status)) as Listed;
      counts[status] = result.count ?? 0;
    }),
  );
  if (query.stock && query.stock !== 'all') {
    const matched: ProductRow[] = [];
    let cursor = 0;
    for (;;) {
      const chunk = (await filtered(supabase, query)
        .order(ordering.column, { ascending: ordering.ascending })
        .range(cursor, cursor + 999)) as Listed;
      if (chunk.error) {
        throw new AppError('PRODUCT_LIST_FAILED', chunk.error.message, 500);
      }
      const rows = chunk.data ?? [];
      for (const row of rows) {
        const available = inStock(row);
        if (query.stock === 'in' ? available : !available) {
          matched.push(row);
        }
      }
      if (rows.length < 1000) {
        break;
      }
      cursor += 1000;
    }
    return {
      products: matched.slice(offset, offset + limit).map((row) => listedProduct(row)),
      total: matched.length,
      page,
      limit,
      counts,
    };
  }
  const rows = (await filtered(supabase, query)
    .order(ordering.column, { ascending: ordering.ascending })
    .range(offset, offset + limit - 1)) as Listed;
  if (rows.error) {
    throw new AppError('PRODUCT_LIST_FAILED', rows.error.message, 500);
  }
  const counted = (await filtered(supabase, query).select('*', { count: 'exact', head: true })) as Listed;
  return {
    products: (rows.data ?? []).map((row) => listedProduct(row)),
    total: counted.count ?? rows.data?.length ?? 0,
    page,
    limit,
    counts,
  };
}

export async function removeOrArchiveProduct(
  supabase: DbClient,
  productId: string,
): Promise<{ action: 'deleted' | 'archived'; productId: string }> {
  await getProduct(supabase, productId);
  const orders = (await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)) as Listed;
  if ((orders.count ?? 0) > 0) {
    await updateProductStatus(supabase, productId, 'archived');
    return { action: 'archived', productId };
  }
  for (const table of ['reseller_listings', 'product_bulk_tiers', 'product_assets'] as const) {
    const removed = (await supabase.from(table).delete().eq('product_id', productId)) as { error?: { message: string } | null };
    if (removed.error) {
      throw new AppError('PRODUCT_DELETE_FAILED', removed.error.message, 500);
    }
  }
  const removed = (await supabase.from('products').delete().eq('id', productId)) as { error?: { message: string } | null };
  if (removed.error) {
    throw new AppError('PRODUCT_DELETE_FAILED', removed.error.message, 500);
  }
  return { action: 'deleted', productId };
}

export async function bulkManageProducts(
  supabase: DbClient,
  input: {
    readonly productIds: readonly string[];
    readonly action: 'delete' | 'publish' | 'pause' | 'archive' | 'set-category';
    readonly category?: string | null;
  },
): Promise<{ results: Array<{ id: string; ok: boolean; action?: string; error?: string }> }> {
  if (input.productIds.length === 0) {
    throw new ValidationError('PRODUCT_IDS_REQUIRED', 'Choose at least one product');
  }
  if (input.productIds.length > 200) {
    throw new ValidationError('PRODUCT_BATCH_TOO_LARGE', 'Update at most 200 products at a time');
  }
  const results: Array<{ id: string; ok: boolean; action?: string; error?: string }> = [];
  for (const id of input.productIds) {
    try {
      if (input.action === 'delete') {
        const outcome = await removeOrArchiveProduct(supabase, id);
        results.push({ id, ok: true, action: outcome.action });
        continue;
      }
      if (input.action === 'set-category') {
        await updateProduct(supabase, id, { category: input.category ?? null });
        results.push({ id, ok: true, action: 'set-category' });
        continue;
      }
      const status: ProductStatus =
        input.action === 'publish' ? 'published' : input.action === 'pause' ? 'paused' : 'archived';
      await updateProductStatus(supabase, id, status);
      results.push({ id, ok: true, action: status });
    } catch (error: unknown) {
      if (error instanceof NotFoundError || error instanceof ValidationError || error instanceof AppError) {
        results.push({ id, ok: false, error: error.message });
        continue;
      }
      results.push({ id, ok: false, error: 'Unable to update product' });
    }
  }
  return { results };
}
