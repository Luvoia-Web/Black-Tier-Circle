/**
 * @file modules/catalog/index.ts
 *
 * Catalog public API with sandbox products.
 *
 * Prices are always server-defined. Callers must not accept client prices.
 *
 * @module Catalog
 */

import { NotFoundError } from '@/lib/errors';
import { usdtToMinor } from '@/lib/money';
import type { Product } from './types';

export type { DeliveryType, Product, ProductStatus } from './types';

const SANDBOX_PRODUCTS: readonly Product[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    sku: 'EBOOK-DEMO-001',
    title: 'Demo Ebook',
    description: 'Synthetic test product',
    category: 'ebooks',
    deliveryType: 'file_reusable',
    status: 'published',
    wholesalePriceMinor: usdtToMinor('5'),
    retailPriceMinor: usdtToMinor('10'),
    stockUnlimited: true,
    stockCount: null,
    resellerEligible: true,
    maxPurchaseQty: 1,
    version: 1,
  },
];

/**
 * Lists published sandbox products.
 *
 * @returns Read-only product list
 */
export function listPublishedProducts(): readonly Product[] {
  return SANDBOX_PRODUCTS.filter((product) => product.status === 'published');
}

/**
 * Loads one product by id from the sandbox catalog.
 *
 * @param productId - Product UUID
 * @returns Matching product
 * @throws NotFoundError when the product is missing
 */
export function getProductById(productId: string): Product {
  const product = SANDBOX_PRODUCTS.find((item) => item.id === productId);
  if (!product) {
    throw new NotFoundError('product');
  }
  return product;
}
