/**
 * Live is what the buyer bot will sell. The bot still shows a sold-out published product.
 */

import { describe, expect, it } from 'vitest';
import { isSoldOut } from '@/modules/catalog/shop-screen';
import { isListedInBot } from '@/modules/catalog/visibility';
import { buyerStage } from '@/modules/platform/catalog';

describe('buyer stage', () => {
  it('marks a published in-stock product live, which is what the bot sells', () => {
    const product = { status: 'published', stockUnlimited: true, stockCount: null, supplierInStock: true };
    expect(isListedInBot(product.status)).toBe(true);
    expect(isSoldOut(product)).toBe(false);
    expect(buyerStage(product)).toBe('live');
  });

  it('keeps a published sold-out product visible to the bot and out of the sellable stage', () => {
    const product = { status: 'published', stockUnlimited: true, stockCount: null, supplierInStock: false };
    expect(isListedInBot(product.status)).toBe(true);
    expect(isSoldOut(product)).toBe(true);
    expect(buyerStage(product)).toBe('out_of_stock');
  });

  it('does not call an archived product live', () => {
    const product = { status: 'archived', stockUnlimited: true, stockCount: null, supplierInStock: true };
    expect(isListedInBot(product.status)).toBe(false);
    expect(buyerStage(product)).toBe('archived');
  });
});
