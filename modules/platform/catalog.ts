/**
 * @file modules/platform/catalog.ts
 *
 * One row per supplier item, plus own products that no supplier row points at.
 * Paging and totals happen here, not in the browser.
 */

import { AppError } from '@/lib/errors';
import { formatUsdt } from '@/lib/money';
import type { DbClient, QueryBuilder, QueryResult } from '@/lib/supabase/query';

export type CatalogStage = 'not_imported' | 'imported' | 'live' | 'paused' | 'out_of_stock' | 'archived';
export type StockKind = 'unlimited' | 'count' | 'out' | 'unknown';

export type CatalogRow = {
  readonly id: string;
  readonly supplierProductId: string | null;
  readonly productId: string | null;
  readonly listingId: string | null;
  readonly supplierId: string | null;
  readonly supplierName: string;
  readonly title: string;
  readonly sku: string;
  readonly category: string | null;
  readonly stage: CatalogStage;
  readonly stockLabel: string;
  readonly stockKind: StockKind;
  readonly stockCount: number | null;
  readonly status: string;
  readonly priceMinor: string;
  readonly costMinor: string | null;
  readonly marginLabel: string;
  readonly deliveryLabel: string;
  readonly imageUrl: string | null;
  readonly salesCount: number;
  readonly wholesaleKind: 'percent' | 'fixed';
  readonly wholesaleValue: string;
  readonly retailKind: 'percent' | 'fixed';
  readonly retailValue: string;
};

export type CatalogSummary = {
  readonly itemCount: number;
  readonly supplierCount: number;
  readonly liveCount: number;
  readonly attentionCount: number;
  readonly categoryCounts: readonly { readonly name: string; readonly count: number }[];
};

export type CatalogPage = {
  readonly rows: readonly CatalogRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly suppliers: readonly { readonly id: string; readonly name: string }[];
  readonly categories: readonly string[];
  readonly summary: CatalogSummary;
  readonly role: 'owner' | 'reseller';
};

export type CatalogDetail = {
  readonly row: CatalogRow;
  readonly history: readonly { readonly id: string; readonly label: string; readonly at: string }[];
};

const PAGE_SIZES = [24, 48, 96] as const;
const PRODUCT_COLUMNS = 'id, sku, title, category, status, stock_unlimited, stock_count, supplier_id, wholesale_price, retail_price, delivery_type, requires_email_activation, wholesale_markup_kind, wholesale_markup_percent, wholesale_markup_minor, retail_markup_kind, retail_markup_percent, retail_markup_minor, created_at';
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
  readonly searchIds?: readonly string[];
};

function records(result: QueryResult<unknown>): Record<string, unknown>[] {
  if (result.error) {
    throw new AppError('READ_FAILED', result.error.message, 500);
  }
  if (!Array.isArray(result.data)) {
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
    stage: stage === 'not_imported' || stage === 'imported' || stage === 'live' || stage === 'paused' || stage === 'out_of_stock' || stage === 'archived' ? stage : 'all',
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
  if (status === 'archived') {
    return 'archived';
  }
  if (status === 'paused') {
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

async function idsWhere(query: QueryBuilder<unknown>): Promise<string[]> {
  return records((await query) as QueryResult<unknown>).map((row) => text(row.id)).filter(Boolean);
}

async function withSearch(db: DbClient, filters: Filters, source: 'supplier' | 'product'): Promise<Filters> {
  if (!filters.search) {
    return filters;
  }
  const like = `%${filters.search}%`;
  const supplierIds = await idsWhere(db.from('suppliers').select('id').ilike('name', like).limit(50));
  if (source === 'supplier') {
    const byName = await idsWhere(db.from('supplier_products').select('id').ilike('name', like).limit(200));
    const bySku = await idsWhere(db.from('supplier_products').select('id').ilike('supplier_sku', like).limit(200));
    const bySupplier = supplierIds.length === 0
      ? []
      : await idsWhere(db.from('supplier_products').select('id').in('supplier_id', [...supplierIds]).limit(200));
    return { ...filters, searchIds: [...new Set([...byName, ...bySku, ...bySupplier])] };
  }
  const byTitle = await idsWhere(db.from('products').select('id').ilike('title', like).limit(200));
  const bySku = await idsWhere(db.from('products').select('id').ilike('sku', like).limit(200));
  const bySupplier = supplierIds.length === 0
    ? []
    : await idsWhere(db.from('products').select('id').in('supplier_id', [...supplierIds]).limit(200));
  return { ...filters, searchIds: [...new Set([...byTitle, ...bySku, ...bySupplier])] };
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
  if (filters.searchIds && filters.searchIds.length === 0) {
    query = query.eq('id', '00000000-0000-0000-0000-000000000000');
  } else if (filters.searchIds) {
    query = query.in('id', filters.searchIds);
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
  if (filters.searchIds && filters.searchIds.length === 0) {
    query = query.eq('id', '00000000-0000-0000-0000-000000000000');
  } else if (filters.searchIds) {
    query = query.in('id', filters.searchIds);
  }
  if (filters.stage === 'imported') {
    query = query.eq('status', 'draft');
  }
  if (filters.stage === 'paused') {
    query = query.eq('status', 'paused');
  }
  if (filters.stage === 'archived') {
    query = query.eq('status', 'archived');
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

function minorOf(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
    return null;
  }
  const raw = String(value);
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    return null;
  }
  const [whole, frac = ''] = raw.split('.');
  return (BigInt(whole || '0') * 1_000_000n + BigInt((frac + '000000').slice(0, 6))).toString();
}

function marginLabel(price: string, cost: string | null): string {
  if (!cost) {
    return '—';
  }
  try {
    const retail = BigInt(price);
    const wholesale = BigInt(cost);
    if (retail <= 0n) {
      return '—';
    }
    const points = Number(((retail - wholesale) * 10000n) / retail);
    return `${(points / 100).toFixed(1)}%`;
  } catch {
    return '—';
  }
}

function deliveryWord(value: string, email: boolean): string {
  if (email || value === 'email_activation') {
    return 'Activation';
  }
  if (value === 'manual') {
    return 'Manual';
  }
  if (value === 'inventory_unit') {
    return 'Key';
  }
  return 'Instant';
}

function presentRow(input: {
  readonly id: string;
  readonly supplierProductId: string | null;
  readonly productId: string | null;
  readonly listingId?: string | null;
  readonly supplierId: string | null;
  readonly supplierName: string;
  readonly title: string;
  readonly sku: string;
  readonly category: string | null;
  readonly stage: CatalogStage;
  readonly product: Record<string, unknown> | null;
  readonly supplier: Record<string, unknown> | null;
  readonly wholesaleKind: 'percent' | 'fixed';
  readonly wholesaleValue: string;
  readonly retailKind: 'percent' | 'fixed';
  readonly retailValue: string;
}): CatalogRow {
  const supplierOut = input.supplier?.in_stock === false;
  const unlimited = input.product?.stock_unlimited === true || (!input.product && input.supplier?.stock_count == null && !supplierOut);
  const count = typeof input.product?.stock_count === 'number'
    ? input.product.stock_count
    : typeof input.supplier?.stock_count === 'number'
      ? input.supplier.stock_count
      : null;
  const stockKind: StockKind = supplierOut || (input.product && !unlimited && (count ?? 0) <= 0)
    ? 'out'
    : !input.product && !input.supplier
      ? 'unknown'
      : unlimited
        ? 'unlimited'
        : 'count';
  const price = minorOf(input.product?.retail_price) ?? minorOf(input.supplier?.retail_price_minor) ?? minorOf(input.supplier?.supplier_public_price) ?? '0';
  const cost = minorOf(input.product?.wholesale_price) ?? minorOf(input.supplier?.wholesale_price_minor) ?? minorOf(input.supplier?.supplier_price);
  const delivery = deliveryWord(
    text(input.supplier?.delivery_type) || text(input.product?.delivery_type),
    input.product?.requires_email_activation === true || input.supplier?.requires_email_activation === true,
  );
  return {
    id: input.id,
    supplierProductId: input.supplierProductId,
    productId: input.productId,
    listingId: input.listingId ?? null,
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    title: input.title,
    sku: input.sku,
    category: input.category,
    stage: input.stage,
    stockLabel: stockLabel(input.product, supplierOut),
    stockKind,
    stockCount: stockKind === 'count' ? count : stockKind === 'out' ? 0 : null,
    status: text(input.product?.status) || (input.product ? 'draft' : 'not_imported'),
    priceMinor: price,
    costMinor: cost,
    marginLabel: marginLabel(price, cost),
    deliveryLabel: delivery,
    imageUrl: text(input.supplier?.image_url) || null,
    salesCount: 0,
    wholesaleKind: input.wholesaleKind,
    wholesaleValue: input.wholesaleValue,
    retailKind: input.retailKind,
    retailValue: input.retailValue,
  };
}

function toSupplierRow(row: Record<string, unknown>, product: Record<string, unknown> | null, names: Map<string, string>): CatalogRow {
  const wholesale = ruleOf(product, 'wholesale');
  const retail = ruleOf(product, 'retail');
  const id = text(row.id);
  const supplierId = text(row.supplier_id) || null;
  return presentRow({
    id,
    supplierProductId: id,
    productId: text(row.product_id) || null,
    supplierId,
    supplierName: names.get(text(row.supplier_id)) ?? 'Supplier',
    title: text(product?.title) || text(row.name) || id,
    sku: text(product?.sku) || text(row.supplier_sku),
    category: text(product?.category) || text(row.category) || null,
    stage: stageOf(product, row.in_stock === false),
    product,
    supplier: row,
    wholesaleKind: wholesale.kind,
    wholesaleValue: wholesale.value,
    retailKind: retail.kind,
    retailValue: retail.value,
  });
}

function toOwnRow(row: Record<string, unknown>, names: Map<string, string>): CatalogRow {
  const wholesale = ruleOf(row, 'wholesale');
  const retail = ruleOf(row, 'retail');
  const id = text(row.id);
  const supplierId = text(row.supplier_id) || null;
  return presentRow({
    id,
    supplierProductId: null,
    productId: id,
    supplierId,
    supplierName: supplierId ? names.get(supplierId) ?? 'Supplier' : 'Own product',
    title: text(row.title) || id,
    sku: text(row.sku),
    category: text(row.category) || null,
    stage: stageOf(row, false),
    product: row,
    supplier: null,
    wholesaleKind: wholesale.kind,
    wholesaleValue: wholesale.value,
    retailKind: retail.kind,
    retailValue: retail.value,
  });
}

async function salesFor(db: DbClient, productIds: readonly string[], tenantId: string | null): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (productIds.length === 0) {
    return map;
  }
  let query = db.from('orders').select('product_id').in('product_id', [...productIds]).eq('payment_status', 'verified').limit(2000);
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
  for (const row of records((await query) as QueryResult<unknown>)) {
    const id = text(row.product_id);
    if (id) {
      map.set(id, (map.get(id) ?? 0) + 1);
    }
  }
  return map;
}

function withSales(rows: readonly CatalogRow[], sales: Map<string, number>): CatalogRow[] {
  return rows.map((row) => ({ ...row, salesCount: row.productId ? sales.get(row.productId) ?? 0 : 0 }));
}

async function ownerSummary(db: DbClient, supplierCount: number): Promise<CatalogSummary> {
  const supplierItems = await countOf(db.from('supplier_products'));
  const ownItems = await countOf(db.from('products').is('supplier_id', null));
  const live = await countOf(db.from('products').eq('status', 'published'));
  const attention = await countOf(db.from('products').eq('stock_unlimited', false).lte('stock_count', '0'));
  const counts = new Map<string, number>();
  for (const row of records((await db.from('products').select('category').eq('status', 'published').limit(2000)) as QueryResult<unknown>)) {
    const category = text(row.category);
    if (category) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return {
    itemCount: supplierItems + ownItems,
    supplierCount,
    liveCount: live,
    attentionCount: attention,
    categoryCounts: [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 12).map(([name, count]) => ({ name, count })),
  };
}

async function ownerPage(db: DbClient, filters: Filters): Promise<CatalogPage> {
  const productStage = filters.stage === 'imported' || filters.stage === 'live' || filters.stage === 'paused' || filters.stage === 'out_of_stock' || filters.stage === 'archived';
  const includeSupplier = !productStage && filters.supplier !== 'own';
  const ownOnly = filters.supplier === 'own' || (!productStage && !filters.supplier);
  const includeProducts = filters.stage !== 'not_imported' && (productStage || !filters.supplier || filters.supplier === 'own');
  const supplierFilters = includeSupplier ? await withSearch(db, filters, 'supplier') : filters;
  const productFilters = includeProducts ? await withSearch(db, filters, 'product') : filters;
  const supplierCount = includeSupplier ? await countOf(supplierQuery(db, supplierFilters)) : 0;
  const productCount = includeProducts ? await countOf(productQuery(db, productFilters, ownOnly)) : 0;
  const total = supplierCount + productCount;
  const start = (filters.page - 1) * filters.pageSize;
  const rows: CatalogRow[] = [];
  const facet = await facets(db);
  const names = new Map(facet.suppliers.map((supplier) => [supplier.id, supplier.name]));

  if (includeSupplier && start < supplierCount) {
    const take = Math.min(filters.pageSize, supplierCount - start);
    const result = (await supplierQuery(db, supplierFilters).select('*').order(sortColumn(filters, 'supplier'), { ascending: true }).range(start, start + take - 1)) as QueryResult<unknown>;
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
    const scoped = productQuery(db, productFilters, ownOnly);
    const result = (await scoped.select(PRODUCT_COLUMNS).order(sortColumn(filters, 'product'), { ascending: true }).range(productStart, productStart + productTake - 1)) as QueryResult<unknown>;
    const narrowed = result.error
      ? ((await productQuery(db, productFilters, ownOnly).select(PRODUCT_COLUMNS_NARROW).order(sortColumn(filters, 'product'), { ascending: true }).range(productStart, productStart + productTake - 1)) as QueryResult<unknown>)
      : result;
    if (narrowed.error) {
      throw new AppError('CATALOG_LIST_FAILED', narrowed.error.message, 500);
    }
    for (const row of records(narrowed)) {
      const mapped = toOwnRow(row, names);
      if (filters.stock === 'in' && mapped.stage === 'out_of_stock') {
        continue;
      }
      if (filters.stage === 'live' && mapped.stage !== 'live' && mapped.stage !== 'out_of_stock') {
        continue;
      }
      if (filters.stage === 'out_of_stock' && mapped.stage !== 'out_of_stock') {
        continue;
      }
      rows.push(mapped);
    }
  }
  const sold = await salesFor(db, rows.map((row) => row.productId).filter((id): id is string => Boolean(id)), null);
  return {
    rows: withSales(rows, sold),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    suppliers: facet.suppliers,
    categories: facet.categories,
    summary: await ownerSummary(db, facet.suppliers.length),
    role: 'owner',
  };
}

async function resellerPage(db: DbClient, tenantId: string, filters: Filters): Promise<CatalogPage> {
  const listings = records((await db.from('reseller_listings').select('id, product_id, is_visible, retail_price').eq('tenant_id', tenantId).limit(1000)) as QueryResult<unknown>);
  const products = await readProducts(db, listings.map((row) => text(row.product_id)).filter(Boolean));
  const names = new Map((await facets(db)).suppliers.map((item) => [item.id, item.name]));
  let rows = listings.map((listing) => {
    const product = products.get(text(listing.product_id)) ?? null;
    const base = product ? toOwnRow(product, names) : presentRow({
      id: text(listing.id),
      supplierProductId: null,
      productId: text(listing.product_id) || null,
      supplierId: null,
      supplierName: 'Listing',
      title: text(listing.product_id) || 'Listing',
      sku: '',
      category: null,
      stage: 'imported',
      product: null,
      supplier: null,
      wholesaleKind: 'percent',
      wholesaleValue: '0',
      retailKind: 'percent',
      retailValue: '0',
    });
    const paused = listing.is_visible === false;
    const price = minorOf(listing.retail_price) ?? base.priceMinor;
    return {
      ...base,
      id: text(listing.product_id) || text(listing.id),
      listingId: text(listing.id) || null,
      priceMinor: price,
      marginLabel: marginLabel(price, base.costMinor),
      stage: paused ? 'paused' as const : base.stage,
    };
  });
  const needle = filters.search.toLowerCase();
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.category && (row.stage === 'live' || row.stage === 'out_of_stock')) {
      counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
    }
  }
  const summary: CatalogSummary = {
    itemCount: rows.length,
    supplierCount: new Set(rows.map((row) => row.supplierId).filter((id): id is string => Boolean(id))).size,
    liveCount: rows.filter((row) => row.stage === 'live' || row.stage === 'out_of_stock').length,
    attentionCount: rows.filter((row) => row.stockKind === 'out').length,
    categoryCounts: [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 12).map(([name, count]) => ({ name, count })),
  };
  rows = rows.filter((row) => {
    if (filters.stage === 'live') {
      if (row.stage !== 'live' && row.stage !== 'out_of_stock') return false;
    } else if (filters.stage !== 'all' && row.stage !== filters.stage) {
      return false;
    }
    if (filters.category && row.category !== filters.category) {
      return false;
    }
    if (!needle) {
      return true;
    }
    return row.title.toLowerCase().includes(needle) || row.sku.toLowerCase().includes(needle) || row.supplierName.toLowerCase().includes(needle);
  });
  const start = (filters.page - 1) * filters.pageSize;
  const pageRows = rows.slice(start, start + filters.pageSize);
  const sold = await salesFor(db, pageRows.map((row) => row.productId).filter((id): id is string => Boolean(id)), tenantId);
  return {
    rows: withSales(pageRows, sold),
    total: rows.length,
    page: filters.page,
    pageSize: filters.pageSize,
    suppliers: [],
    categories: [...new Set(rows.map((row) => row.category).filter((category): category is string => Boolean(category)))].sort(),
    summary,
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
    row = toOwnRow(product, names);
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
