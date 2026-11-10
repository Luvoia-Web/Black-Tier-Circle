import { describe, expect, it } from 'vitest';
import { buyerFacingCategory } from '@/modules/catalog/buyer-category';

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
});
