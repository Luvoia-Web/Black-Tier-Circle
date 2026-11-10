import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/lib/errors';
import { CreateProductSchema } from '@/lib/validations/catalog';
import { hintCardText, normalizeCardText, readCardHints } from '@/modules/catalog/card-text';
import { createProduct, updateProduct } from '@/modules/catalog';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

describe('product card fields', () => {
  it('reads explicit supplier hints and ignores the product name', () => {
    expect(
      readCardHints({
        name: '12 months warranty included',
        title: '30 days',
        productType: 'slot',
        duration: '12 months',
        warranty: '30 days',
        typeLabel: 'Instant',
      }),
    ).toEqual({
      durationText: '12 months',
      warrantyText: '30 days',
      typeLabel: 'Instant',
    });
    expect(readCardHints({ name: 'Netflix 12 months', description: 'Warranty: 7 days' })).toEqual({
      durationText: null,
      warrantyText: null,
      typeLabel: null,
    });
    expect(hintCardText('N/A')).toBeNull();
    expect(hintCardText('null')).toBeNull();
    expect(hintCardText('undefined')).toBeNull();
    expect(readCardHints({ supplier_metadata: { duration_text: '6 months', warranty: '<b>no</b>' } })).toEqual({
      durationText: '6 months',
      warrantyText: null,
      typeLabel: null,
    });
  });

  it('rejects owner text that is too long or not plain', () => {
    expect(normalizeCardText('  30 days  ')).toBe('30 days');
    expect(normalizeCardText('')).toBeNull();
    expect(normalizeCardText(null)).toBeNull();
    expect(() => normalizeCardText('x'.repeat(61))).toThrow(ValidationError);
    expect(() => normalizeCardText('30 <days>')).toThrow(ValidationError);
  });

  it('stores and clears the columns in minor-unit products', async () => {
    const db = createMemoryDb();
    const created = await createProduct(db, {
      sku: 'CARD-001',
      title: 'Sample',
      deliveryType: 'file_reusable',
      wholesalePriceMinor: 5_000_000n,
      retailPriceMinor: 10_000_000n,
      durationText: '12 months',
      warrantyText: '30 days',
      typeLabel: 'Instant',
    });
    expect(created.durationText).toBe('12 months');
    expect(created.warrantyText).toBe('30 days');
    expect(created.typeLabel).toBe('Instant');
    expect(created.retailPriceMinor).toBe(10_000_000n);
    const cleared = await updateProduct(db, created.id, { durationText: null, warrantyText: ' ' });
    expect(cleared.durationText).toBeNull();
    expect(cleared.warrantyText).toBeNull();
    expect(cleared.typeLabel).toBe('Instant');
  });

  it('rejects a card field longer than 60 characters in the API schema', () => {
    const parsed = CreateProductSchema.safeParse({
      sku: 'CARD-001',
      title: 'Sample',
      deliveryType: 'manual',
      wholesalePriceStr: '5000000',
      retailPriceStr: '10000000',
      durationText: 'x'.repeat(61),
    });
    expect(parsed.success).toBe(false);
  });
});
