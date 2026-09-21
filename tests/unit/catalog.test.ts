/**
 * @file tests/unit/catalog.test.ts
 *
 * Unit tests for catalog product lifecycle, assets, and signed URLs.
 *
 * @module Tests
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/lib/errors';
import {
  attachAsset,
  createProduct,
  generateDownloadUrl,
  updateProductStatus,
  type CreateProductInput,
} from '@/modules/catalog';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

function baseInput(overrides: Partial<CreateProductInput> = {}): CreateProductInput {
  return {
    sku: 'EBOOK-001',
    title: 'Demo Ebook',
    deliveryType: 'file_reusable',
    wholesalePriceMinor: 5_000_000n,
    retailPriceMinor: 10_000_000n,
    ...overrides,
  };
}

describe('createProduct', () => {
  it('throws ValidationError when wholesalePrice > retailPrice', async () => {
    const db = createMemoryDb();
    await expect(
      createProduct(
        db,
        baseInput({ wholesalePriceMinor: 20_000_000n, retailPriceMinor: 10_000_000n }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when wholesalePrice is 0', async () => {
    const db = createMemoryDb();
    await expect(
      createProduct(db, baseInput({ wholesalePriceMinor: 0n })),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('updateProductStatus', () => {
  it('succeeds from draft to published', async () => {
    const db = createMemoryDb();
    const created = await createProduct(db, baseInput());
    const published = await updateProductStatus(db, created.id, 'published');
    expect(published.status).toBe('published');
  });

  it('throws when un-archiving (archived → published)', async () => {
    const db = createMemoryDb();
    const created = await createProduct(db, baseInput());
    await updateProductStatus(db, created.id, 'archived');
    await expect(updateProductStatus(db, created.id, 'published')).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe('attachAsset', () => {
  it('creates an asset record correctly', async () => {
    const db = createMemoryDb();
    const product = await createProduct(db, baseInput());
    const asset = await attachAsset(db, product.id, {
      storagePath: 'products/test/file.pdf',
      contentType: 'application/pdf',
      fileSizeBytes: 128,
      isPreview: false,
    });
    expect(asset.productId).toBe(product.id);
    expect(asset.contentType).toBe('application/pdf');
    expect(asset.fileSizeBytes).toBe(128);
    expect(asset.isPreview).toBe(false);
    expect(db.tables.product_assets).toHaveLength(1);
  });
});

describe('generateDownloadUrl', () => {
  it('returns a string URL (mock storage)', async () => {
    const db = createMemoryDb();
    const product = await createProduct(db, baseInput());
    const asset = await attachAsset(db, product.id, {
      storagePath: 'products/test/file.pdf',
      contentType: 'application/pdf',
      fileSizeBytes: 128,
      isPreview: false,
    });
    const url = await generateDownloadUrl(db, asset.id, 3600);
    expect(typeof url).toBe('string');
    expect(url).toContain('signed');
  });
});
