/**
 * @file tests/unit/tenant-settings.test.ts
 *
 * Tenant settings, markup, and store-status tests.
 *
 * @module Tests
 */

import { describe, expect, it } from 'vitest';
import { decrypt } from '@/lib/encryption';
import { createProduct, updateProductStatus } from '@/modules/catalog';
import {
  applyBulkMarkup,
  applyMarkupToWholesale,
  createListing,
  effectiveRetailPrice,
  updateListingPrice,
} from '@/modules/pricing';
import {
  getTenantSettings,
  storeAllowsBotOrders,
  updateTenantSettings,
} from '@/modules/tenant-settings';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const TENANT_ID = '00000000-0000-4000-8000-000000000010';

describe('getTenantSettings', () => {
  it('returns defaults for new tenant', async () => {
    const db = createMemoryDb();
    const settings = await getTenantSettings(db, TENANT_ID);
    expect(settings.storeStatus).toBe('open');
    expect(settings.markupPercent).toBe(0);
    expect(settings.binancePayConfigured).toBe(false);
  });
});

describe('updateTenantSettings', () => {
  it('encrypts Binance keys before storing', async () => {
    const db = createMemoryDb();
    await getTenantSettings(db, TENANT_ID);
    await updateTenantSettings(db, TENANT_ID, {
      binanceApiKey: 'plain-api-key-value',
      binanceApiSecret: 'plain-api-secret-value',
    });
    const row = db.tables.tenant_settings?.[0];
    if (!row) {
      throw new Error('expected tenant_settings row');
    }
    expect(String(row.binance_api_key_encrypted)).not.toBe('plain-api-key-value');
    expect(decrypt(String(row.binance_api_key_encrypted))).toBe('plain-api-key-value');
    expect(decrypt(String(row.binance_api_secret_encrypted))).toBe('plain-api-secret-value');
  });
});

describe('markup and overrides', () => {
  it('applies markup % across all listings', async () => {
    const db = createMemoryDb();
    const product = await createProduct(db, {
      sku: 'MARK-001',
      title: 'Notes',
      deliveryType: 'file_reusable',
      wholesalePriceMinor: 10_000_000n,
      retailPriceMinor: 12_000_000n,
    });
    await updateProductStatus(db, product.id, 'published');
    await createListing(db, {
      tenantId: TENANT_ID,
      productId: product.id,
      retailPriceMinor: 12_000_000n,
    });
    const updated = await applyBulkMarkup(db, TENANT_ID, 25);
    expect(updated[0]?.retailPriceMinor).toBe(applyMarkupToWholesale(10_000_000n, 25));
    expect(updated[0]?.priceOverride).toBe(false);
  });

  it('per-product price override takes precedence over markup', async () => {
    const wholesale = 10_000_000n;
    const override = 18_000_000n;
    expect(effectiveRetailPrice(wholesale, override, true, 25)).toBe(override);
    expect(effectiveRetailPrice(wholesale, override, false, 25)).toBe(applyMarkupToWholesale(wholesale, 25));
    const db = createMemoryDb();
    const product = await createProduct(db, {
      sku: 'MARK-002',
      title: 'Notes 2',
      deliveryType: 'file_reusable',
      wholesalePriceMinor: wholesale,
      retailPriceMinor: 12_000_000n,
    });
    await updateProductStatus(db, product.id, 'published');
    const listing = await createListing(db, {
      tenantId: TENANT_ID,
      productId: product.id,
      retailPriceMinor: 12_000_000n,
    });
    const overridden = await updateListingPrice(db, listing.id, TENANT_ID, override);
    expect(overridden.priceOverride).toBe(true);
  });
});

describe('store status', () => {
  it('maintenance blocks bot orders', () => {
    expect(storeAllowsBotOrders({ storeStatus: 'open' })).toBe(true);
    expect(storeAllowsBotOrders({ storeStatus: 'maintenance' })).toBe(false);
  });
});
