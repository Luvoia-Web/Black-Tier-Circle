/**
 * Wholesale and retail markups are independent.
 * Percent multiplies the cost. Fixed adds a flat minor-unit amount.
 */

import { describe, expect, it } from 'vitest';
import { createProduct } from '@/modules/catalog';
import {
  catalogWriteForChange,
  normalizeLinkedProduct,
  pricesForRules,
  type MarkupSide,
  type SyncPolicy,
} from '@/modules/supplier/catalog-sync';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const USDT = 1_000_000n;
const fixed = (minor: bigint): MarkupSide => ({ kind: 'fixed', percent: null, minor });
const percent = (value: number): MarkupSide => ({ kind: 'percent', percent: value, minor: null });

const policy: SyncPolicy = {
  autoStockSync: true,
  autoReprice: true,
  defaultMarkupPercent: 50,
  minMarginPercent: 10,
  wholesale: percent(50),
  retail: percent(50),
};

function linked(overrides: Record<string, unknown> = {}) {
  return normalizeLinkedProduct({
    id: 'prod-1',
    retail_price: '3000000',
    wholesale_price: '2000000',
    supplier_price_minor: '1000000',
    pricing_mode: 'markup',
    markup_percent: null,
    supplier_in_stock: true,
    status: 'published',
    version: 1,
    auto_paused_reason: null,
    ...overrides,
  });
}

describe('pricesForRules', () => {
  it('adds a fixed amount on each side and follows a cost rise', () => {
    expect(pricesForRules(USDT, fixed(USDT), fixed(2n * USDT))).toEqual({
      wholesale: 2n * USDT,
      retail: 3n * USDT,
    });
    expect(pricesForRules(2n * USDT, fixed(USDT), fixed(2n * USDT))).toEqual({
      wholesale: 3n * USDT,
      retail: 4n * USDT,
    });
  });

  it('multiplies each side by its own percent and follows a cost rise', () => {
    expect(pricesForRules(USDT, percent(100), percent(200))).toEqual({
      wholesale: 2n * USDT,
      retail: 3n * USDT,
    });
    expect(pricesForRules(2n * USDT, percent(100), percent(200))).toEqual({
      wholesale: 4n * USDT,
      retail: 6n * USDT,
    });
  });
});

describe('catalogWriteForChange markup rules', () => {
  it('reprices wholesale and retail independently when the supplier cost rises', () => {
    const write = catalogWriteForChange({
      product: linked({
        wholesale_markup_kind: 'fixed',
        wholesale_markup_minor: '1000000',
        retail_markup_kind: 'fixed',
        retail_markup_minor: '2000000',
      }),
      name: 'Fixed',
      inStock: true,
      costMinor: 2n * USDT,
      policy,
      considerCost: true,
    });
    expect(write?.patch.wholesale_price).toBe('3000000');
    expect(write?.patch.retail_price).toBe('4000000');
    expect(write?.repriced).toBe(true);
    expect(write?.autoPaused).toBe(false);
  });

  it('reprices a percent rule the same way', () => {
    const write = catalogWriteForChange({
      product: linked({
        retail_price: '3000000',
        wholesale_price: '2000000',
        wholesale_markup_kind: 'percent',
        wholesale_markup_percent: 100,
        retail_markup_kind: 'percent',
        retail_markup_percent: 200,
      }),
      name: 'Percent',
      inStock: true,
      costMinor: 2n * USDT,
      policy,
      considerCost: true,
    });
    expect(write?.patch.wholesale_price).toBe('4000000');
    expect(write?.patch.retail_price).toBe('6000000');
  });

  it('pauses a fixed markup that does not lift retail above cost', () => {
    const write = catalogWriteForChange({
      product: linked({
        wholesale_markup_kind: 'fixed',
        wholesale_markup_minor: '1000000',
        retail_markup_kind: 'fixed',
        retail_markup_minor: '0',
      }),
      name: 'Flat',
      inStock: true,
      costMinor: 2n * USDT,
      policy,
      considerCost: true,
    });
    expect(write?.autoPaused).toBe(true);
    expect(write?.patch.status).toBe('paused');
    expect(write?.patch.auto_paused_reason).toBe('Retail is at or below the supplier cost');
    expect(write?.patch.wholesale_price).toBeUndefined();
    expect(write?.patch.retail_price).toBeUndefined();
  });

  it('uses the store default rules when a new product has none of its own', () => {
    const store: SyncPolicy = {
      ...policy,
      wholesale: fixed(USDT),
      retail: fixed(2n * USDT),
    };
    const write = catalogWriteForChange({
      product: linked(),
      name: 'Inherited',
      inStock: true,
      costMinor: 2n * USDT,
      policy: store,
      considerCost: true,
    });
    expect(write?.patch.wholesale_price).toBe('3000000');
    expect(write?.patch.retail_price).toBe('4000000');
    expect(write?.patch.wholesale_markup_kind).toBe('fixed');
    expect(write?.patch.retail_markup_minor).toBe('2000000');
  });
});

describe('createProduct store defaults', () => {
  it('copies the platform markup rules onto a new product', async () => {
    const db = createMemoryDb({
      platform_settings: [
        {
          id: 'settings',
          default_markup_percent: 50,
          min_margin_percent: 10,
          auto_stock_sync: true,
          auto_reprice_on_cost_change: true,
          default_wholesale_markup_kind: 'fixed',
          default_wholesale_markup_minor: '1000000',
          default_retail_markup_kind: 'fixed',
          default_retail_markup_minor: '2000000',
        },
      ],
    });
    await createProduct(db, {
      sku: 'NEW-001',
      title: 'New',
      deliveryType: 'file_reusable',
      wholesalePriceMinor: 2n * USDT,
      retailPriceMinor: 3n * USDT,
    });
    expect(db.tables.products?.[0]).toMatchObject({
      wholesale_markup_kind: 'fixed',
      wholesale_markup_minor: '1000000',
      retail_markup_kind: 'fixed',
      retail_markup_minor: '2000000',
    });
  });
});
