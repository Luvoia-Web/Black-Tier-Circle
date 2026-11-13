/**
 * Supplier catalog paging stays on the database range.
 * A query without range is capped at 1000, the same limit Supabase applies.
 */

import { describe, expect, it } from 'vitest';
import type { DbClient } from '@/lib/supabase/query';
import { listSupplierProducts } from '@/modules/supplier';

type Row = Record<string, unknown>;

function client(supplierRows: Row[], productRows: Row[] = []): DbClient {
  return {
    from(table: string) {
      const source = table === 'products' ? productRows : supplierRows;
      const filters: Array<{ column: string; value: string }> = [];
      let pattern = '';
      let range: { from: number; to: number } | null = null;
      let exact = false;
      let head = false;
      let orderColumn = 'name';
      let ascending = true;
      const builder = {
        select(_columns?: string, options?: { count?: 'exact'; head?: boolean }) {
          exact = options?.count === 'exact';
          head = options?.head === true;
          return builder;
        },
        eq(column: string, value: string | number | boolean) {
          filters.push({ column, value: String(value) });
          return builder;
        },
        or(expression: string) {
          pattern = expression.match(/ilike\.%(.*?)%/)?.[1]?.toLowerCase() ?? '';
          return builder;
        },
        order(column: string, options?: { ascending?: boolean }) {
          orderColumn = column;
          ascending = options?.ascending !== false;
          return builder;
        },
        range(from: number, to: number) {
          range = { from, to };
          return builder;
        },
        in() {
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
        limit() {
          return builder;
        },
        insert() {
          return builder;
        },
        update() {
          return builder;
        },
        delete() {
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
        single() {
          return Promise.resolve({ data: null, error: { message: 'missing' } });
        },
        then(onfulfilled?: ((value: unknown) => unknown) | null) {
          let rows = source.filter((row) => filters.every((filter) => String(row[filter.column] ?? '') === filter.value));
          if (pattern) {
            rows = rows.filter((row) => {
              const name = String(row.name ?? '').toLowerCase();
              const sku = String(row.supplier_sku ?? '').toLowerCase();
              return name.includes(pattern) || sku.includes(pattern);
            });
          }
          rows = [...rows].sort((left, right) => {
            const av = left[orderColumn];
            const bv = right[orderColumn];
            const an = typeof av === 'number' ? av : Number(av);
            const bn = typeof bv === 'number' ? bv : Number(bv);
            const compared = Number.isFinite(an) && Number.isFinite(bn) ? an - bn : String(av ?? '').localeCompare(String(bv ?? ''));
            return ascending ? compared : -compared;
          });
          const total = rows.length;
          if (head) {
            rows = [];
          } else if (!range) {
            rows = rows.slice(0, 1000);
          } else {
            rows = rows.slice(range.from, range.to + 1);
          }
          return Promise.resolve({ data: rows, error: null, count: exact ? total : null }).then(onfulfilled ?? undefined);
        },
      };
      return builder;
    },
    rpc: async () => ({ data: null, error: null }),
  } as unknown as DbClient;
}

function supplierRow(index: number, overrides: Row = {}): Row {
  const n = String(index).padStart(4, '0');
  return {
    id: `sp-${n}`,
    supplier_id: 'sup-1',
    supplier_sku: `sku-${n}`,
    name: `Product ${n}`,
    description: null,
    category: 'Streaming',
    image_url: index === 1 ? 'https://cdn.example/1.png' : null,
    supplier_price: index,
    supplier_public_price: index + 1,
    delivery_type: 'instant',
    requires_email_activation: false,
    in_stock: index % 2 === 1,
    stock_count: index % 5 === 0 ? null : index,
    sold_count: index,
    review_status: index % 10 === 0 ? 'rejected' : 'pending_review',
    wholesale_price_minor: null,
    retail_price_minor: null,
    product_id: null,
    duration_text: '30 days',
    warranty_text: '7 days',
    type_label: 'Key',
    last_synced_at: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('listSupplierProducts', () => {
  it('returns the requested page and the database total', async () => {
    const rows = Array.from({ length: 30 }, (_, index) => supplierRow(index + 1));
    const page = await listSupplierProducts(client(rows), {
      supplierId: 'sup-1',
      page: 2,
      limit: 24,
      status: 'all',
    });
    expect(page.total).toBe(30);
    expect(page.products).toHaveLength(6);
    expect(page.products[0]?.name).toBe('Product 0025');
    expect(page.products[0]?.supplierPublicPrice).toBe('26');
    expect(page.products[0]?.durationText).toBe('30 days');
    expect(page.counts.pending_review).toBe(27);
    expect(page.counts.rejected).toBe(3);
  });

  it('narrows by status, stock, and search', async () => {
    const rows = [supplierRow(1), supplierRow(2, { review_status: 'paused', name: 'Special key' }), supplierRow(10)];
    const db = client(rows);
    const paused = await listSupplierProducts(db, { supplierId: 'sup-1', status: 'paused' });
    expect(paused.products.map((row) => row.id)).toEqual(['sp-0002']);
    expect(paused.total).toBe(1);
    const out = await listSupplierProducts(db, { supplierId: 'sup-1', status: 'all', stock: 'out' });
    expect(out.products.every((row) => row.inStock === false)).toBe(true);
    expect(out.total).toBe(2);
    const found = await listSupplierProducts(db, { supplierId: 'sup-1', status: 'all', search: 'special' });
    expect(found.products.map((row) => row.supplierSku)).toEqual(['sku-0002']);
  });

  it('treats a matching catalog supplier_sku as published', async () => {
    const rows = [supplierRow(1), supplierRow(2), supplierRow(3)];
    const db = client(rows, [{ id: 'prod-2', supplier_id: 'sup-1', supplier_sku: 'sku-0002' }]);
    const published = await listSupplierProducts(db, { supplierId: 'sup-1', status: 'all', pushed: 'published' });
    expect(published.products.map((row) => row.supplierSku)).toEqual(['sku-0002']);
    expect(published.products[0]?.productId).toBe('prod-2');
    const hidden = await listSupplierProducts(db, { supplierId: 'sup-1', status: 'all', pushed: 'not_published' });
    expect(hidden.total).toBe(2);
    expect(hidden.products.map((row) => row.supplierSku)).not.toContain('sku-0002');
  });

  it('reaches a row past the 1000 row cap', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => supplierRow(index + 1, { review_status: 'pending_review' }));
    const page = await listSupplierProducts(client(rows), {
      supplierId: 'sup-1',
      page: 42,
      limit: 24,
      status: 'all',
    });
    expect(page.total).toBe(1001);
    expect(page.products.at(-1)?.name).toBe('Product 1001');
    expect(page.counts.pending_review).toBe(1001);
  });
});
