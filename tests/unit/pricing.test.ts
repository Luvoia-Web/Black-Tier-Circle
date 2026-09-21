/**
 * @file tests/unit/pricing.test.ts
 *
 * Unit tests for reseller listings and margin helpers.
 *
 * @module Tests
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/lib/errors';
import { createProduct, updateProductStatus } from '@/modules/catalog';
import {
  createListing,
  getMarginMinor,
  getMarginPercent,
  toggleListingVisibility,
} from '@/modules/pricing';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

describe('createListing', () => {
  it('throws ValidationError with a helpful message when retailPrice < wholesalePrice', async () => {
    const db = createMemoryDb();
    const product = await createProduct(db, {
      sku: 'NOTE-001',
      title: 'Notes',
      deliveryType: 'file_reusable',
      wholesalePriceMinor: 5_000_000n,
      retailPriceMinor: 10_000_000n,
    });
    await updateProductStatus(db, product.id, 'published');
    await expect(
      createListing(db, {
        tenantId: 'tenant-1',
        productId: product.id,
        retailPriceMinor: 1_000_000n,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/Retail price must be at least/i);
      expect((error as ValidationError).message).toMatch(/wholesale price/i);
      return true;
    });
  });
});

describe('getMarginMinor', () => {
  it('returns the correct bigint margin', () => {
    expect(getMarginMinor(5_000_000n, 10_000_000n)).toBe(5_000_000n);
  });
});

describe('getMarginPercent', () => {
  it('returns the correct percentage', () => {
    expect(getMarginPercent(5_000_000n, 10_000_000n)).toBe(50);
  });
});

describe('toggleListingVisibility', () => {
  it('flips the boolean', async () => {
    const db = createMemoryDb();
    const product = await createProduct(db, {
      sku: 'NOTE-002',
      title: 'Notes 2',
      deliveryType: 'file_reusable',
      wholesalePriceMinor: 5_000_000n,
      retailPriceMinor: 10_000_000n,
    });
    await updateProductStatus(db, product.id, 'published');
    const listing = await createListing(db, {
      tenantId: 'tenant-1',
      productId: product.id,
      retailPriceMinor: 12_000_000n,
    });
    expect(listing.isVisible).toBe(true);
    const hidden = await toggleListingVisibility(db, listing.id, 'tenant-1');
    expect(hidden.isVisible).toBe(false);
    const shown = await toggleListingVisibility(db, listing.id, 'tenant-1');
    expect(shown.isVisible).toBe(true);
  });
});
