/**
 * Delete archives. Permanent delete refuses while an order still points at the product.
 */

import { describe, expect, it } from 'vitest';
import { createProduct, listProducts, updateProductStatus } from '@/modules/catalog';
import { bulkManageProducts, deleteProductPermanently, removeOrArchiveProduct } from '@/modules/catalog/manage';
import { isListedInBot } from '@/modules/catalog/visibility';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

async function product(db: ReturnType<typeof createMemoryDb>, sku: string) {
  return createProduct(db, {
    sku,
    title: sku,
    deliveryType: 'file_reusable',
    wholesalePriceMinor: 2_000_000n,
    retailPriceMinor: 3_000_000n,
  });
}

describe('removeOrArchiveProduct', () => {
  it('archives a sold product and keeps it out of the bot', async () => {
    const db = createMemoryDb();
    const created = await product(db, 'SOLD-1');
    await updateProductStatus(db, created.id, 'published');
    db.tables.orders = [{ id: 'order-1', product_id: created.id, payment_status: 'verified' }];
    const result = await removeOrArchiveProduct(db, created.id);
    expect(result.action).toBe('archived');
    expect(isListedInBot('archived')).toBe(false);
    const visible = await listProducts(db, { status: 'published' });
    expect(visible.map((item) => item.id)).not.toContain(created.id);
  });

  it('archives an unsold product instead of removing the row', async () => {
    const db = createMemoryDb();
    const created = await product(db, 'FREE-1');
    const result = await removeOrArchiveProduct(db, created.id);
    expect(result.action).toBe('archived');
    expect(db.tables.products?.some((row) => row.id === created.id && row.status === 'archived')).toBe(true);
  });

  it('refuses a permanent delete while an order references the product', async () => {
    const db = createMemoryDb();
    const created = await product(db, 'KEEP-1');
    db.tables.orders = [{ id: 'order-1', product_id: created.id }];
    await expect(deleteProductPermanently(db, created.id)).rejects.toThrow(/still has orders/);
    expect(db.tables.products?.some((row) => row.id === created.id)).toBe(true);
  });

  it('deletes a product with no orders and unlinks the supplier row', async () => {
    const db = createMemoryDb();
    const created = await product(db, 'GONE-1');
    db.tables.product_bulk_tiers = [{ id: 'tier-1', product_id: created.id, min_qty: 2, unit_price_minor: '1000000' }];
    db.tables.reseller_listings = [{ id: 'list-1', product_id: created.id, tenant_id: 'tenant-1' }];
    db.tables.product_assets = [{ id: 'asset-1', product_id: created.id }];
    db.tables.supplier_products = [{ id: 'sup-1', product_id: created.id, review_status: 'published', name: 'Card' }];
    const result = await deleteProductPermanently(db, created.id);
    expect(result.action).toBe('deleted');
    expect(db.tables.products?.some((row) => row.id === created.id)).toBe(false);
    expect(db.tables.supplier_products).toEqual([
      expect.objectContaining({ id: 'sup-1', product_id: null, review_status: 'pending_review', name: 'Card' }),
    ]);
  });

  it('keeps going when one bulk id is missing', async () => {
    const db = createMemoryDb();
    const first = await product(db, 'BULK-1');
    const second = await product(db, 'BULK-2');
    const result = await bulkManageProducts(db, {
      productIds: [first.id, 'missing-id', second.id],
      action: 'delete',
    });
    expect(result.results.filter((item) => item.ok)).toHaveLength(2);
    expect(result.results.find((item) => item.id === 'missing-id')?.ok).toBe(false);
    expect(db.tables.products?.every((row) => row.status === 'archived')).toBe(true);
  });
});
