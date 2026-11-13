/**
 * Bulk publish prices a batch from supplier cost plus a markup.
 * One missing id does not roll back the others.
 */

import { describe, expect, it } from 'vitest';
import { bulkPublishSupplierProducts, publishSupplierProduct } from '@/modules/supplier';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

function supplierRow(id: string) {
  return {
    id,
    supplier_id: 'sup-1',
    supplier_sku: `sku-${id}`,
    name: `Product ${id}`,
    description: `About ${id}`,
    category: 'Streaming',
    image_url: null,
    supplier_price: '2.000000',
    supplier_public_price: '3.000000',
    delivery_type: 'instant',
    requires_email_activation: false,
    in_stock: true,
    review_status: 'pending_review',
    wholesale_price_minor: null,
    retail_price_minor: null,
    product_id: null,
  };
}

describe('bulkPublishSupplierProducts', () => {
  it('prices three products at 50 percent and stores the category', async () => {
    const db = createMemoryDb({
      supplier_products: [supplierRow('a'), supplierRow('b'), supplierRow('c')],
    });

    const result = await bulkPublishSupplierProducts(db, {
      supplierProductIds: ['a', 'b', 'c'],
      markupPercent: 50,
      buyerCategory: 'Premium',
    });

    expect(result.results.map((item) => item.ok)).toEqual([true, true, true]);
    expect(db.tables.products).toHaveLength(3);
    for (const product of db.tables.products ?? []) {
      expect(product).toMatchObject({
        pricing_mode: 'markup',
        markup_percent: 50,
        wholesale_price: '3000000',
        retail_price: '3000000',
        supplier_price_minor: '2000000',
        category: 'Streaming',
        buyer_category: 'Premium',
      });
    }
  });

  it('publishes the valid ids when one id is missing', async () => {
    const db = createMemoryDb({
      supplier_products: [supplierRow('a'), supplierRow('b'), supplierRow('c')],
    });

    const result = await bulkPublishSupplierProducts(db, {
      supplierProductIds: ['a', 'missing', 'b', 'c'],
      markupPercent: 50,
      buyerCategory: 'Premium',
    });

    expect(result.results.filter((item) => item.ok)).toHaveLength(3);
    expect(result.results.find((item) => item.id === 'missing')).toMatchObject({ ok: false });
    expect(db.tables.products).toHaveLength(3);
    expect(db.tables.products?.every((product) => product.category === 'Streaming')).toBe(true);
  });

  it('refreshes the linked product title and description', async () => {
    const db = createMemoryDb({
      supplier_products: [{ ...supplierRow('a'), product_id: 'prod-1', name: 'Fresh title', description: 'Fresh copy' }],
      products: [{ id: 'prod-1', title: 'Old', description: 'Old copy', sku: 'SUPPLIER-sku-a' }],
    });

    await publishSupplierProduct(db, 'a', { markupPercent: 50 });

    expect(db.tables.products?.[0]).toMatchObject({
      title: 'Fresh title',
      description: 'Fresh copy',
      pricing_mode: 'markup',
      category: 'Streaming',
    });
  });
});
