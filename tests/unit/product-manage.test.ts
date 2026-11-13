/**
 * Sold products are archived. Unsold products are deleted with their tiers.
 */

import { describe, expect, it } from 'vitest';
import { createProduct, listProducts, updateProductStatus } from '@/modules/catalog';
import { bulkManageProducts, removeOrArchiveProduct } from '@/modules/catalog/manage';
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

  it('deletes an unsold product and its tiers, listings, and assets', async () => {
    const db = createMemoryDb();
    const created = await product(db, 'FREE-1');
    db.tables.product_bulk_tiers?.push({ id: 'tier-1', product_id: created.id, min_qty: 2, unit_price_minor: '1000000' });
    db.tables.reseller_listings?.push({ id: 'list-1', product_id: created.id, tenant_id: 'tenant-1' });
    db.tables.product_assets?.push({ id: 'asset-1', product_id: created.id });
    const result = await removeOrArchiveProduct(db, created.id);
    expect(result.action).toBe('deleted');
    expect(db.tables.products?.some((row) => row.id === created.id)).toBe(false);
    expect(db.tables.product_bulk_tiers).toEqual([]);
    expect(db.tables.reseller_listings).toEqual([]);
    expect(db.tables.product_assets).toEqual([]);
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
    expect(db.tables.products).toEqual([]);
  });
});
