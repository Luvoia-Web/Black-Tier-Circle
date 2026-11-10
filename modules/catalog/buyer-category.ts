/**
 * Category label shown to Telegram buyers.
 * Supplier catalog names stay on the product row and are not shown.
 */

import type { Product } from '@/modules/catalog/types';

export function buyerFacingCategory(product: Pick<Product, 'category' | 'supplierId'> & { buyerCategory?: string | null }): string | null {
  const assigned = product.buyerCategory?.trim() ?? '';
  if (assigned.length > 0) {
    return assigned;
  }
  if (product.supplierId) {
    return null;
  }
  const category = product.category?.trim() ?? '';
  return category.length > 0 ? category : null;
}

export function buyerCategoryNames(
  products: readonly (Pick<Product, 'category' | 'supplierId'> & { buyerCategory?: string | null })[],
): string[] {
  return [...new Set(products.map((product) => buyerFacingCategory(product)).filter((name): name is string => name !== null))].sort(
    (left, right) => left.localeCompare(right),
  );
}
