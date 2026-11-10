import { describe, expect, it } from 'vitest';
import { buyerCategoryNames, buyerFacingCategory } from '@/modules/catalog/buyer-category';

describe('buyer shop categories', () => {
  it('hides a supplier catalog label and keeps an owner category', () => {
    expect(
      buyerFacingCategory({
        category: 'Supplier',
        supplierId: '00000000-0000-4000-8000-000000000901',
        buyerCategory: null,
      }),
    ).toBeNull();
    expect(
      buyerFacingCategory({
        category: 'Dealer',
        supplierId: '00000000-0000-4000-8000-000000000901',
      }),
    ).toBeNull();
    expect(
      buyerFacingCategory({
        category: 'Supplier',
        supplierId: '00000000-0000-4000-8000-000000000901',
        buyerCategory: 'Games',
      }),
    ).toBe('Games');
    expect(
      buyerFacingCategory({
        category: 'Keys',
        supplierId: null,
        buyerCategory: null,
      }),
    ).toBe('Keys');
  });

  it('lists each buyer category once and skips supplier labels', () => {
    expect(
      buyerCategoryNames([
        { category: 'Supplier', supplierId: 'sup', buyerCategory: 'Games' },
        { category: 'Supplier', supplierId: 'sup', buyerCategory: null },
        { category: 'Keys', supplierId: null, buyerCategory: null },
        { category: 'Keys', supplierId: null, buyerCategory: null },
      ]),
    ).toEqual(['Games', 'Keys']);
  });
});
