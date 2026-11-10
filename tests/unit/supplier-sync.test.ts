/**
 * @file tests/unit/supplier-sync.test.ts
 *
 * Batch product sync: chunking, preserved review data, and adapter detection.
 */

import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { encrypt } from '@/lib/encryption';
import type { DbClient } from '@/lib/supabase/query';
import { syncSupplierProducts } from '@/modules/supplier';

const { createProdSellerClient, listProducts } = vi.hoisted(() => {
  const listProducts = vi.fn();
  const createProdSellerClient = vi.fn(() => ({ listProducts }));
  return { createProdSellerClient, listProducts };
});

vi.mock('@/integrations/prodseller/client', () => ({
  createProdSellerClient,
  SupplierError: class SupplierError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

const SUPPLIER_ID = 'sup-1';
const PREVIOUS_ENCRYPTION_KEY = process.env.BOT_TOKEN_ENCRYPTION_KEY;

beforeAll(() => {
  process.env.BOT_TOKEN_ENCRYPTION_KEY = 'ab'.repeat(32);
});

afterAll(() => {
  if (PREVIOUS_ENCRYPTION_KEY === undefined) {
    delete process.env.BOT_TOKEN_ENCRYPTION_KEY;
  } else {
    process.env.BOT_TOKEN_ENCRYPTION_KEY = PREVIOUS_ENCRYPTION_KEY;
  }
});

type SyncFilter = { op: 'eq' | 'in'; column: string; value: string | string[] };
type SyncCall = {
  readonly table: string;
  readonly op: string;
  readonly payload: unknown;
  readonly filters: SyncFilter[];
  readonly range: { from: number; to: number } | null;
};

function createSyncDb(options: {
  readonly supplier: Record<string, unknown>;
  readonly products: Array<Record<string, unknown>>;
  readonly failInsert?: (rows: Array<Record<string, unknown>>) => boolean;
}): { client: DbClient; products: Array<Record<string, unknown>>; calls: SyncCall[]; maxInFlight: () => number } {
  const products = options.products;
  const calls: SyncCall[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  function from(table: string) {
    let op = 'select';
    let payload: unknown;
    const filters: SyncFilter[] = [];
    let range: { from: number; to: number } | null = null;
    let columns = '*';

    function matching(row: Record<string, unknown>): boolean {
      return filters.every((filter) => {
        const actual = String(row[filter.column] ?? '');
        if (filter.op === 'in') {
          return filter.value.includes(actual);
        }
        return actual === filter.value;
      });
    }

    function execute(): { data: unknown; error: { message: string } | null } {
      calls.push({
        table,
        op,
        payload,
        filters: filters.map((filter) => ({
          op: filter.op,
          column: filter.column,
          value: Array.isArray(filter.value) ? [...filter.value] : filter.value,
        })),
        range: range ? { from: range.from, to: range.to } : null,
      });
      if (table === 'suppliers' && op === 'select') {
        return { data: options.supplier, error: null };
      }
      if (table === 'suppliers' && op === 'update') {
        Object.assign(options.supplier, payload as Record<string, unknown>);
        return { data: null, error: null };
      }
      if (table === 'supplier_products' && op === 'select') {
        let rows = products.filter(matching);
        if (range) {
          rows = rows.slice(range.from, range.to + 1);
        }
        if (columns !== '*') {
          const keys = columns.split(',').map((key) => key.trim());
          rows = rows.map((row) => {
            const picked: Record<string, unknown> = {};
            for (const key of keys) {
              picked[key] = row[key];
            }
            return picked;
          });
        }
        return { data: rows, error: null };
      }
      if (table === 'supplier_products' && op === 'insert') {
        const rows = (Array.isArray(payload) ? payload : [payload]) as Array<Record<string, unknown>>;
        if (options.failInsert?.(rows)) {
          return { data: null, error: { message: 'chunk failed' } };
        }
        for (const row of rows) {
          products.push({ ...row });
        }
        return { data: rows, error: null };
      }
      if (table === 'supplier_products' && op === 'update') {
        const patch = payload as Record<string, unknown>;
        for (const row of products) {
          if (matching(row)) {
            Object.assign(row, patch);
          }
        }
        return { data: null, error: null };
      }
      return { data: null, error: { message: `unexpected ${table} ${op}` } };
    }

    const builder = {
      select(cols?: string) {
        columns = cols ?? '*';
        return builder;
      },
      insert(values: unknown) {
        op = 'insert';
        payload = values;
        return builder;
      },
      update(values: unknown) {
        op = 'update';
        payload = values;
        return builder;
      },
      delete() {
        return builder;
      },
      eq(column: string, value: string) {
        filters.push({ op: 'eq', column, value });
        return builder;
      },
      in(column: string, values: readonly string[]) {
        filters.push({ op: 'in', column, value: [...values] });
        return builder;
      },
      is() {
        return builder;
      },
      gte() {
        return builder;
      },
      lte() {
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      range(fromIndex: number, toIndex: number) {
        range = { from: fromIndex, to: toIndex };
        return builder;
      },
      maybeSingle() {
        const result = execute();
        const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
        return Promise.resolve({ data, error: result.error });
      },
      single() {
        return builder.maybeSingle();
      },
      then(
        onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null,
      ) {
        const tracked = op === 'update' && filters.some((filter) => filter.op === 'eq' && filter.column === 'id');
        if (tracked) {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
        }
        return Promise.resolve()
          .then(() => {
            try {
              return execute();
            } finally {
              if (tracked) {
                inFlight -= 1;
              }
            }
          })
          .then(onfulfilled ?? undefined, onrejected ?? undefined);
      },
    };
    return builder;
  }

  return {
    client: { from, rpc: async () => ({ data: null, error: null }) } as unknown as DbClient,
    products,
    calls,
    maxInFlight: () => maxInFlight,
  };
}

function supplierRow(apiKey: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: SUPPLIER_ID,
    name: 'Supplier',
    slug: 'supplier',
    base_url: 'https://prodseller.com/v1',
    api_key_encrypted: encrypt(apiKey),
    auth_header_name: 'X-API-Key',
    status: 'active',
    balance_usdt: 0,
    balance_checked_at: null,
    membership_tier: null,
    last_sync_at: null,
    last_sync_error: null,
    product_count: 12,
    adapter_name: 'prodseller',
    ...overrides,
  };
}

function existingRow(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `id-${index}`,
    supplier_id: SUPPLIER_ID,
    supplier_sku: `sku-${index}`,
    name: `Old ${index}`,
    review_status: 'published',
    in_stock: true,
    wholesale_price_minor: '111',
    retail_price_minor: '222',
    product_id: `prod-${index}`,
    ...overrides,
  };
}

function remoteRow(index: number) {
  return {
    id: `sku-${index}`,
    name: `New ${index}`,
    description: 'Updated copy',
    price: 10 + index,
    publicPrice: 20 + index,
    imageUrl: null,
    requiresEmailActivation: false,
    inStock: true,
    sold: 3,
  };
}

afterEach(() => {
  listProducts.mockReset();
  createProdSellerClient.mockClear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('syncSupplierProducts', () => {
  it('inserts and updates 250 remote products in chunks', async () => {
    listProducts.mockResolvedValue(Array.from({ length: 250 }, (_, index) => remoteRow(index)));
    const db = createSyncDb({
      supplier: supplierRow('psk_unitkey'),
      products: Array.from({ length: 100 }, (_, index) => existingRow(index)),
    });

    const result = await syncSupplierProducts(db.client, SUPPLIER_ID);

    expect(result).toMatchObject({ synced: 250, newProducts: 150, updatedProducts: 100, outOfStock: 0, errors: [] });
    const inserts = db.calls.filter((call) => call.table === 'supplier_products' && call.op === 'insert');
    expect(inserts.map((call) => (call.payload as unknown[]).length)).toEqual([100, 50]);
    const idUpdates = db.calls.filter(
      (call) =>
        call.table === 'supplier_products' &&
        call.op === 'update' &&
        call.filters.some((filter) => filter.op === 'eq' && filter.column === 'id'),
    );
    expect(idUpdates).toHaveLength(100);
    expect(db.maxInFlight()).toBe(20);
    expect(db.products.filter((row) => row.review_status === 'pending_review')).toHaveLength(150);
    expect(db.products.find((row) => row.supplier_sku === 'sku-100')).toMatchObject({
      review_status: 'pending_review',
      first_seen_at: expect.any(String),
    });
  });

  it('keeps review status and prices when a product already exists', async () => {
    listProducts.mockResolvedValue([remoteRow(0)]);
    const db = createSyncDb({
      supplier: supplierRow('psk_unitkey'),
      products: [existingRow(0)],
    });

    await syncSupplierProducts(db.client, SUPPLIER_ID);

    expect(db.products[0]).toMatchObject({
      name: 'New 0',
      supplier_price: 10,
      review_status: 'published',
      wholesale_price_minor: '111',
      retail_price_minor: '222',
      product_id: 'prod-0',
    });
    const update = db.calls.find((call) => call.op === 'update' && call.filters.some((filter) => filter.column === 'id'));
    const payload = update?.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty('review_status');
    expect(payload).not.toHaveProperty('wholesale_price_minor');
    expect(payload).not.toHaveProperty('retail_price_minor');
    expect(payload).not.toHaveProperty('product_id');
  });

  it('marks missing in-stock products out of stock in one call', async () => {
    listProducts.mockResolvedValue([remoteRow(0)]);
    const db = createSyncDb({
      supplier: supplierRow('psk_unitkey'),
      products: [
        existingRow(0),
        existingRow(1, { id: 'missing-stock', supplier_sku: 'sku-1' }),
        existingRow(2, { id: 'already-out', supplier_sku: 'sku-2', in_stock: false }),
      ],
    });

    const result = await syncSupplierProducts(db.client, SUPPLIER_ID);

    expect(result.outOfStock).toBe(1);
    const batched = db.calls.filter((call) => call.filters.some((filter) => filter.op === 'in'));
    expect(batched).toHaveLength(1);
    expect(batched[0]?.filters.find((filter) => filter.op === 'in')?.value).toEqual(['missing-stock']);
    expect(batched[0]?.payload).toMatchObject({ in_stock: false });
    expect(db.products.find((row) => row.id === 'missing-stock')?.in_stock).toBe(false);
    expect(db.products.find((row) => row.id === 'already-out')?.in_stock).toBe(false);
    expect(db.products.find((row) => row.id === 'id-0')?.in_stock).toBe(true);
  });

  it('does not mark anything out of stock when the supplier returns no products', async () => {
    listProducts.mockResolvedValue([]);
    const supplier = supplierRow('psk_unitkey');
    const db = createSyncDb({
      supplier,
      products: [existingRow(0)],
    });

    const result = await syncSupplierProducts(db.client, SUPPLIER_ID);

    expect(result).toMatchObject({
      synced: 0,
      newProducts: 0,
      updatedProducts: 0,
      outOfStock: 0,
      errors: ['Supplier returned no products'],
    });
    expect(db.calls.some((call) => call.table === 'supplier_products')).toBe(false);
    expect(db.products[0]?.in_stock).toBe(true);
    expect(supplier.last_sync_error).toBe('Supplier returned no products');
    expect(supplier.product_count).toBe(12);
  });

  it('reports a failing insert chunk and still syncs the rest', async () => {
    listProducts.mockResolvedValue(Array.from({ length: 250 }, (_, index) => remoteRow(index)));
    const db = createSyncDb({
      supplier: supplierRow('psk_unitkey'),
      products: Array.from({ length: 100 }, (_, index) => existingRow(index)),
      failInsert: (rows) => rows.length === 100,
    });

    const result = await syncSupplierProducts(db.client, SUPPLIER_ID);

    expect(result.errors).toEqual(['chunk failed']);
    expect(result.newProducts).toBe(50);
    expect(result.updatedProducts).toBe(100);
    expect(db.products.some((row) => row.supplier_sku === 'sku-100')).toBe(false);
    expect(db.products.find((row) => row.supplier_sku === 'sku-200')).toMatchObject({ name: 'New 200' });
    expect(db.products.find((row) => row.supplier_sku === 'sku-0')?.name).toBe('New 0');
  });

  it('uses the Canboso adapter when adapter_name is empty and the key starts with tgb_', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const supplier = supplierRow('tgb_unitkey', {
      adapter_name: null,
      base_url: 'https://canboso.com',
      auth_header_name: 'key',
    });
    const db = createSyncDb({ supplier, products: [] });
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain('https://canboso.com/api/v2/telegram-buyer/products?key=');
      return new Response(
        JSON.stringify({
          success: true,
          products: [{ productId: 'c1', name: 'Can product', price: { amount: 4 }, availability: { available: 2 } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncSupplierProducts(db.client, SUPPLIER_ID);

    expect(createProdSellerClient).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ synced: 1, newProducts: 1, updatedProducts: 0, outOfStock: 0, errors: [] });
    expect(supplier.adapter_name).toBe('canboso');
    expect(db.products[0]).toMatchObject({ supplier_sku: 'c1', name: 'Can product', review_status: 'pending_review' });
    const logged = [...log.mock.calls, ...warn.mock.calls, ...error.mock.calls].flat().join(' ');
    expect(logged).not.toContain('tgb_unitkey');
    expect(logged).not.toContain('key=');
  });

  it('does not leak the Canboso key when the request fails', async () => {
    const supplier = supplierRow('tgb_unitkey', {
      adapter_name: null,
      base_url: 'https://canboso.com',
      auth_header_name: 'key',
    });
    const db = createSyncDb({ supplier, products: [existingRow(0)] });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('failed https://canboso.com/api/v2/telegram-buyer/products?key=tgb_unitkey');
      }),
    );

    await expect(syncSupplierProducts(db.client, SUPPLIER_ID)).rejects.toThrow('Cannot reach the supplier.');
    expect(db.products[0]?.in_stock).toBe(true);
    expect(db.calls.some((call) => call.op === 'update' && call.table === 'supplier_products')).toBe(false);
  });

  it('keeps the ProdSeller client for a psk_ key when adapter_name is empty', async () => {
    listProducts.mockResolvedValue([remoteRow(0)]);
    const supplier = supplierRow('psk_unitkey', { adapter_name: null });
    const db = createSyncDb({ supplier, products: [] });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncSupplierProducts(db.client, SUPPLIER_ID);

    expect(createProdSellerClient).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.newProducts).toBe(1);
    expect(supplier.adapter_name).toBe('prodseller');
  });

  it('pages existing products past the 1000 row select limit', async () => {
    listProducts.mockResolvedValue(Array.from({ length: 1001 }, (_, index) => remoteRow(index)));
    const db = createSyncDb({
      supplier: supplierRow('psk_unitkey'),
      products: Array.from({ length: 1001 }, (_, index) => existingRow(index)),
    });

    const result = await syncSupplierProducts(db.client, SUPPLIER_ID);

    expect(result).toMatchObject({ synced: 1001, newProducts: 0, updatedProducts: 1001, outOfStock: 0, errors: [] });
    const pages = db.calls.filter((call) => call.table === 'supplier_products' && call.op === 'select');
    expect(pages.map((call) => call.range)).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
    ]);
    expect(db.maxInFlight()).toBe(20);
  });
});
