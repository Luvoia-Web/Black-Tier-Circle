/**
 * @file modules/platform/catalog.ts
 *
 * One row per supplier item, plus own products that no supplier row points at.
 * Paging and totals happen here, not in the browser.
 */

import { AppError } from '@/lib/errors';
import { formatUsdt } from '@/lib/money';
import type { DbClient, QueryBuilder, QueryResult } from '@/lib/supabase/query';

export type CatalogStage = 'not_imported' | 'imported' | 'live' | 'paused' | 'out_of_stock';

export type CatalogRow = {
  readonly id: string;
  readonly supplierProductId: string | null;
  readonly productId: string | null;
  readonly supplierId: string | null;
  readonly supplierName: string;
  readonly title: string;
  readonly sku: string;
  readonly category: string | null;
  readonly stage: CatalogStage;
  readonly stockLabel: string;
  readonly wholesaleKind: 'percent' | 'fixed';
  readonly wholesaleValue: string;
  readonly retailKind: 'percent' | 'fixed';
  readonly retailValue: string;
};

export type CatalogPage = {
  readonly rows: readonly CatalogRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly suppliers: readonly { readonly id: string; readonly name: string }[];
  readonly categories: readonly string[];
  readonly role: 'owner' | 'reseller';
};

export type CatalogDetail = {
  readonly row: CatalogRow;
  readonly history: readonly { readonly id: string; readonly label: string; readonly at: string }[];
};

const PAGE_SIZES = [24, 48, 96] as const;
const PRODUCT_COLUMNS = 'id, sku, title, category, status, stock_unlimited, stock_count, supplier_id, wholesale_markup_kind, wholesale_markup_percent, wholesale_markup_minor, retail_markup_kind, retail_markup_percent, retail_markup_minor, created_at';
const PRODUCT_COLUMNS_NARROW = 'id, sku, title, category, status, stock_unlimited, stock_count, supplier_id, created_at';

type Filters = {
  readonly page: number;
  readonly pageSize: number;
  readonly search: string;
  readonly supplier: string;
  readonly stage: CatalogStage | 'all';
  readonly stock: 'all' | 'in' | 'out';
  readonly category: string;
  readonly sort: 'title' | 'stock' | 'created';
};

function records(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error || !Array.isArray(result.data)) {
    return [];
  }
  return result.data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function safeTerm(raw: string): string {
  return raw.replace(/[%_,."']/g, '').trim().slice(0, 64);
}

export function parseCatalogFilters(params: URLSearchParams): Filters {
  const requested = Number(params.get('pageSize') ?? '24') || 24;
  const stage = params.get('stage');
  const stock = params.get('stock');
  const sort = params.get('sort');
  return {
    page: Math.max(1, Number(params.get('page') ?? '1') || 1),
    pageSize: PAGE_SIZES.includes(requested as (typeof PAGE_SIZES)[number]) ? requested : 24,
    search: safeTerm(params.get('search') ?? ''),
    supplier: text(params.get('supplier')),
    stage: stage === 'not_imported' || stage === 'imported' || stage === 'live' || stage === 'paused' || stage === 'out_of_stock' ? stage : 'all',
    stock: stock === 'in' || stock === 'out' ? stock : 'all',
    category: text(params.get('category')).slice(0, 80),
    sort: sort === 'stock' || sort === 'created' ? sort : 'title',
  };
}

function stageOf(product: Record<string, unknown> | null, supplierOut: boolean): CatalogStage {
  if (!product) {
    return 'not_imported';
  }
  const status = text(product.status);
  if (status === 'paused' || status === 'archived') {
    return 'paused';
  }
  if (status !== 'published') {
    return 'imported';
  }
  const unlimited = product.stock_unlimited === true;
  const count = typeof product.stock_count === 'number' ? product.stock_count : 0;
  if (supplierOut || (!unlimited && count <= 0)) {
    return 'out_of_stock';
  }
  return 'live';
}

function ruleOf(row: Record<string, unknown> | null, side: 'wholesale' | 'retail'): { kind: 'percent' | 'fixed'; value: string } {
  const kind = row?.[`${side}_markup_kind`] === 'fixed' ? 'fixed' : 'percent';
  if (kind === 'fixed') {
    const minor = row?.[`${side}_markup_minor`];
    const value = typeof minor === 'string' || typeof minor === 'number' ? BigInt(minor) : 0n;
    return { kind, value: formatUsdt(value).replace(' USDT', '') };
  }
  const percent = row?.[`${side}_markup_percent`];
  const number = typeof percent === 'number' ? percent : typeof percent === 'string' ? Number(percent) : 0;
  return { kind, value: Number.isFinite(number) ? String(number) : '0' };
}

function stockLabel(product: Record<string, unknown> | null, supplierOut: boolean): string {
  if (supplierOut) {
    return 'Out at supplier';
  }
  if (!product) {
    return 'Not imported';
  }
  if (product.stock_unlimited === true) {
    return 'Unlimited';
  }
  return typeof product.stock_count === 'number' ? String(product.stock_count) : '0';
}

async function readProducts(db: DbClient, ids: readonly string[]): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  if (ids.length === 0) {
    return map;
  }
  const rich = (await db.from('products').select(PRODUCT_COLUMNS).in('id', ids)) as QueryResult<unknown>;
  const result = rich.error ? ((await db.from('products').select(PRODUCT_COLUMNS_NARROW).in('id', ids)) as QueryResult<unknown>) : rich;
  if (result.error) {
    throw new AppError('CATALOG_PRODUCTS_FAILED', result.error.message, 500);
  }
  for (const row of records(result)) {
    const id = text(row.id);
    if (id) {
      map.set(id, row);
    }
  }
  return map;
}

async function countOf(query: QueryBuilder<unknown>): Promise<number> {
  const result = (await query.select('id', { count: 'exact', head: true })) as QueryResult<unknown>;
  if (result.error) {
    throw new AppError('CATALOG_COUNT_FAILED', result.error.message, 500);
  }
  return result.count ?? 0;
}

function supplierQuery(db: DbClient, filters: Filters): QueryBuilder<unknown> {
  let query = db.from('supplier_products');
  if (filters.supplier && filters.supplier !== 'own') {
    query = query.eq('supplier_id', filters.supplier);
  }
  if (filters.category) {
    query = query.eq('category', filters.category);
  }
  if (filters.stock === 'in') {
    query = query.eq('in_stock', true);
  }
  if (filters.stock === 'out') {
    query = query.eq('in_stock', false);
  }
  if (filters.search) {
    query = query.or(`name.ilike."%${filters.search}%",supplier_sku.ilike."%${filters.search}%"`);
  }
  if (filters.stage === 'not_imported') {
    query = query.is('product_id', null);
  }
  return query;
}

function productQuery(db: DbClient, filters: Filters, onlyOwn: boolean): QueryBuilder<unknown> {
  let query = db.from('products');
  if (onlyOwn) {
    query = query.is('supplier_id', null);
  }
  if (filters.category) {
    query = query.eq('category', filters.category);
  }
  if (filters.stock === 'out') {
    query = query.eq('stock_unlimited', false).lte('stock_count', '0');
  }
  if (filters.search) {
    query = query.or(`title.ilike."%${filters.search}%",sku.ilike."%${filters.search}%"`);
  }
  if (filters.stage === 'imported') {
    query = query.eq('status', 'draft');
  }
  if (filters.stage === 'paused') {
    query = query.eq('status', 'paused');
  }
  if (filters.stage === 'live' || filters.stage === 'out_of_stock') {
    query = query.eq('status', 'published');
  }
  if (filters.supplier && filters.supplier !== 'own') {
    query = query.eq('supplier_id', filters.supplier);
  }
  return query;
}

function sortColumn(filters: Filters, source: 'supplier' | 'product'): string {
  if (filters.sort === 'stock') {
    return 'stock_count';
  }
  if (filters.sort === 'created') {
    return source === 'supplier' ? 'first_seen_at' : 'created_at';
  }
  return source === 'supplier' ? 'name' : 'title';
}

async function facets(db: DbClient): Promise<{ suppliers: { id: string; name: string }[]; categories: string[] }> {
  const suppliers = records((await db.from('suppliers').select('id, name').order('name', { ascending: true }).limit(100)) as QueryResult<unknown>)
    .map((row) => ({ id: text(row.id), name: text(row.name) }))
    .filter((row) => row.id && row.name);
  const categories = new Set<string>();
  for (const row of records((await db.from('products').select('category').limit(300)) as QueryResult<unknown>)) {
    const category = text(row.category);
    if (category) {
      categories.add(category);
    }
  }
  return { suppliers, categories: [...categories].sort() };
}

function toSupplierRow(row: Record<string, unknown>, product: Record<string, unknown> | null, names: Map<string, string>): CatalogRow {
  const supplierOut = row.in_stock === false;
  const wholesale = ruleOf(product, 'wholesale');
  const retail = ruleOf(product, 'retail');
  const id = text(row.id);
  return {
    id,
    supplierProductId: id,
    productId: text(row.product_id) || null,
    supplierId: text(row.supplier_id) || null,
    supplierName: names.get(text(row.supplier_id)) ?? 'Supplier',
    title: text(product?.title) || text(row.name) || id,
    sku: text(product?.sku) || text(row.supplier_sku),
    category: text(product?.category) || text(row.category) || null,
    stage: stageOf(product, supplierOut),
    stockLabel: stockLabel(product, supplierOut),
    wholesaleKind: wholesale.kind,
    wholesaleValue: wholesale.value,
    retailKind: retail.kind,
    retailValue: retail.value,
  };
}

function toOwnRow(row: Record<string, unknown>): CatalogRow {
  const wholesale = ruleOf(row, 'wholesale');
  const retail = ruleOf(row, 'retail');
  const id = text(row.id);
  return {
    id,
    supplierProductId: null,
    productId: id,
    supplierId: null,
    supplierName: 'Own product',
    title: text(row.title) || id,
    sku: text(row.sku),
    category: text(row.category) || null,
    stage: stageOf(row, false),
    stockLabel: stockLabel(row, false),
    wholesaleKind: wholesale.kind,
    wholesaleValue: wholesale.value,
    retailKind: retail.kind,
    retailValue: retail.value,
  };
}

async function ownerPage(db: DbClient, filters: Filters): Promise<CatalogPage> {
  const productStage = filters.stage === 'imported' || filters.stage === 'live' || filters.stage === 'paused' || filters.stage === 'out_of_stock';
  const includeSupplier = !productStage && filters.supplier !== 'own';
  const ownOnly = filters.supplier === 'own' || (!productStage && !filters.supplier);
  const includeProducts = filters.stage !== 'not_imported' && (productStage || !filters.supplier || filters.supplier === 'own');
  const supplierCount = includeSupplier ? await countOf(supplierQuery(db, filters)) : 0;
  const productCount = includeProducts ? await countOf(productQuery(db, filters, ownOnly)) : 0;
  const total = supplierCount + productCount;
  const start = (filters.page - 1) * filters.pageSize;
  const rows: CatalogRow[] = [];
  const facet = await facets(db);
  const names = new Map(facet.suppliers.map((supplier) => [supplier.id, supplier.name]));

  if (includeSupplier && start < supplierCount) {
    const take = Math.min(filters.pageSize, supplierCount - start);
    const result = (await supplierQuery(db, filters).select('*').order(sortColumn(filters, 'supplier'), { ascending: true }).range(start, start + take - 1)) as QueryResult<unknown>;
    if (result.error) {
      throw new AppError('CATALOG_LIST_FAILED', result.error.message, 500);
    }
    const supplierRows = records(result);
    const products = await readProducts(db, supplierRows.map((row) => text(row.product_id)).filter(Boolean));
    for (const row of supplierRows) {
      rows.push(toSupplierRow(row, products.get(text(row.product_id)) ?? null, names));
    }
  }
  const productStart = Math.max(0, start - supplierCount);
  const productTake = filters.pageSize - rows.length;
  if (includeProducts && productTake > 0 && productStart < productCount) {
    const scoped = productQuery(db, filters, ownOnly);
    const result = (await scoped.select(PRODUCT_COLUMNS).order(sortColumn(filters, 'product'), { ascending: true }).range(productStart, productStart + productTake - 1)) as QueryResult<unknown>;
    const narrowed = result.error
      ? ((await productQuery(db, filters, ownOnly).select(PRODUCT_COLUMNS_NARROW).order(sortColumn(filters, 'product'), { ascending: true }).range(productStart, productStart + productTake - 1)) as QueryResult<unknown>)
      : result;
    if (narrowed.error) {
      throw new AppError('CATALOG_LIST_FAILED', narrowed.error.message, 500);
    }
    for (const row of records(narrowed)) {
      const mapped = toOwnRow(row);
      if (filters.stock === 'in' && mapped.stage === 'out_of_stock') {
        continue;
      }
      if (filters.stage === 'live' && mapped.stage !== 'live') {
        continue;
      }
      if (filters.stage === 'out_of_stock' && mapped.stage !== 'out_of_stock') {
        continue;
      }
      rows.push(mapped);
    }
  }
  return { rows, total, page: filters.page, pageSize: filters.pageSize, suppliers: facet.suppliers, categories: facet.categories, role: 'owner' };
}

async function resellerPage(db: DbClient, tenantId: string, filters: Filters): Promise<CatalogPage> {
  const listings = records((await db.from('reseller_listings').select('id, product_id, is_visible, retail_price_minor').eq('tenant_id', tenantId).limit(1000)) as QueryResult<unknown>);
  const products = await readProducts(db, listings.map((row) => text(row.product_id)).filter(Boolean));
  let rows = listings.map((listing) => {
    const product = products.get(text(listing.product_id)) ?? null;
    const base = product ? toOwnRow(product) : null;
    const paused = listing.is_visible === false;
    return {
      ...(base ?? {
        id: text(listing.product_id),
        supplierProductId: null,
        productId: text(listing.product_id) || null,
        supplierId: null,
        supplierName: 'Listing',
        title: text(listing.product_id),
        sku: '',
        category: null,
        stage: 'imported' as const,
        stockLabel: 'Unknown',
        wholesaleKind: 'percent' as const,
        wholesaleValue: '0',
        retailKind: 'percent' as const,
        retailValue: '0',
      }),
      id: text(listing.product_id) || text(listing.id),
      stage: paused ? 'paused' as const : base?.stage ?? 'imported',
    };
  });
  const needle = filters.search.toLowerCase();
  rows = rows.filter((row) => {
    if (filters.stage !== 'all' && row.stage !== filters.stage) {
      return false;
    }
    if (filters.category && row.category !== filters.category) {
      return false;
    }
    if (!needle) {
      return true;
    }
    return row.title.toLowerCase().includes(needle) || row.sku.toLowerCase().includes(needle);
  });
  const start = (filters.page - 1) * filters.pageSize;
  return {
    rows: rows.slice(start, start + filters.pageSize),
    total: rows.length,
    page: filters.page,
    pageSize: filters.pageSize,
    suppliers: [],
    categories: [...new Set(rows.map((row) => row.category).filter((category): category is string => Boolean(category)))].sort(),
    role: 'reseller',
  };
}

export async function readCatalog(
  db: DbClient,
  scope: { readonly role: 'owner' | 'reseller'; readonly tenantId: string | null },
  filters: Filters,
): Promise<CatalogPage> {
  if (scope.role === 'reseller') {
    if (!scope.tenantId) {
      throw new AppError('TENANT_REQUIRED', 'Reseller account is not active', 403);
    }
    return resellerPage(db, scope.tenantId, filters);
  }
  return ownerPage(db, filters);
}

export async function readCatalogDetail(db: DbClient, id: string, tenantId: string | null): Promise<CatalogDetail> {
  const supplier = (await db.from('supplier_products').select('*').eq('id', id).maybeSingle()) as QueryResult<Record<string, unknown> | null>;
  const names = new Map((await facets(db)).suppliers.map((item) => [item.id, item.name]));
  let row: CatalogRow | null = null;
  let productId = '';
  if (supplier.data && !supplier.error) {
    const linked = text(supplier.data.product_id);
    const products = await readProducts(db, linked ? [linked] : []);
    row = toSupplierRow(supplier.data, products.get(linked) ?? null, names);
    productId = linked;
  } else {
    const products = await readProducts(db, [id]);
    const product = products.get(id);
    if (!product) {
      throw new AppError('CATALOG_NOT_FOUND', 'That item is not in the catalog.', 404);
    }
    if (tenantId) {
      const listing = (await db.from('reseller_listings').select('id').eq('tenant_id', tenantId).eq('product_id', id).maybeSingle()) as QueryResult<unknown>;
      if (!listing.data) {
        throw new AppError('CATALOG_NOT_FOUND', 'That item is not in your catalog.', 404);
      }
    }
    row = toOwnRow(product);
    productId = id;
  }
  const history: { id: string; label: string; at: string }[] = [];
  if (productId) {
    let orders = db.from('orders').select('id, payment_status, created_at').eq('product_id', productId).order('created_at', { ascending: false }).limit(8);
    if (tenantId) {
      orders = orders.eq('tenant_id', tenantId);
    }
    for (const order of records((await orders) as QueryResult<unknown>)) {
      history.push({
        id: text(order.id),
        label: `Order ${text(order.id).slice(0, 8)} · ${text(order.payment_status) || 'recorded'}`,
        at: text(order.created_at),
      });
    }
  }
  return { row, history };
}
