/**
 * @file tests/unit/platform-settings.test.ts
 *
 * Platform settings encryption and payment-source priority.
 *
 * @module Tests
 */

import { describe, expect, it } from 'vitest';
import { decrypt } from '@/lib/encryption';
import { updatePaymentSettings } from '@/modules/platform';
import { resolveOrderPayments } from '@/modules/payments/resolve';
import { updateTenantSettings } from '@/modules/tenant-settings';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const TENANT_ID = '00000000-0000-4000-8000-000000000010';

describe('platform payment settings', () => {
  it('encrypts Binance credentials before they are stored', async () => {
    const db = createMemoryDb();
    const settings = await updatePaymentSettings(db, {
      binancePayApiKey: 'platform-api-key',
      binancePayApiSecret: 'platform-api-secret',
      binancePayMerchantId: 'merchant-1',
      binancePayEnabled: true,
      platformUsdtWalletBep20: '0xplatform',
      bep20Enabled: true,
    });
    expect(settings.binancePayConfigured).toBe(true);
    expect(settings.binancePayMerchantId).toBe('merchant-1');
    const row = db.tables.platform_settings?.[0];
    expect(String(row?.binance_pay_api_key_encrypted)).not.toBe('platform-api-key');
    expect(decrypt(String(row?.binance_pay_api_key_encrypted))).toBe('platform-api-key');
    expect(decrypt(String(row?.binance_pay_api_secret_encrypted))).toBe('platform-api-secret');
  });

  it('prefers a reseller Binance account over the platform account', async () => {
    const db = createMemoryDb();
    await updatePaymentSettings(db, {
      binancePayApiKey: 'platform-api-key',
      binancePayApiSecret: 'platform-api-secret',
      binancePayMerchantId: 'platform-merchant',
      binancePayEnabled: true,
      platformUsdtWalletBep20: '0xplatform',
      bep20Enabled: true,
    });
    await updateTenantSettings(db, TENANT_ID, {
      binancePayEnabled: true,
      binanceApiKey: 'reseller-api-key',
      binanceApiSecret: 'reseller-api-secret',
      binanceMerchantUid: 'reseller-merchant',
      useOwnUsdtWallet: true,
      usdtWalletBep20: '0xreseller',
    });
    const resolved = await resolveOrderPayments(db, TENANT_ID);
    expect(resolved.demo).toBe(false);
    expect(resolved.binance?.apiKey).toBe('reseller-api-key');
    expect(resolved.binance?.merchantId).toBe('reseller-merchant');
    expect(resolved.bep20Address).toBe('0xreseller');
  });

  it('falls back to the platform wallet when the reseller has no payment setup', async () => {
    const db = createMemoryDb();
    await updatePaymentSettings(db, {
      platformUsdtWalletBep20: '0xplatform',
      bep20Enabled: true,
      binancePayEnabled: false,
    });
    const resolved = await resolveOrderPayments(db, TENANT_ID);
    expect(resolved.binance).toBeNull();
    expect(resolved.bep20Address).toBe('0xplatform');
    expect(resolved.demo).toBe(false);
  });

  it('uses demo mode when nothing is configured', async () => {
    const db = createMemoryDb();
    const resolved = await resolveOrderPayments(db, null);
    expect(resolved.demo).toBe(true);
    expect(resolved.binance).toBeNull();
    expect(resolved.bep20Address).toBeNull();
  });
});
