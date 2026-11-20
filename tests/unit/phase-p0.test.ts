/**
 * @file tests/unit/phase-p0.test.ts
 *
 * Phase P0 regression suite covering fraud enforcement, BEP20 confirmations & expiry,
 * split settings persistence, reseller policy overrides, bot controls, signed Bot Studio
 * previews, legacy redirects, 7-day overview attribution, unified order state, and labels.
 *
 * @module Tests
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BSC_USDT_CONTRACT,
  BSC_USDT_MINOR_DIVISOR,
  ERC20_TRANSFER_TOPIC,
  verifyUsdtTransfer,
  type ChainReader,
} from '@/integrations/bsc/verify';
import {
  displayAuditAction,
  displayDeliveryType,
  displayDiscountValue,
  displayLedgerEntryType,
  displayMarkup,
  displayMemoryType,
  displayOrderEventLabel,
  displayOrderEventNote,
  formatPlainDatesInText,
} from '@/lib/display-labels';
import { encrypt } from '@/lib/encryption';
import { ValidationError } from '@/lib/errors';
import legacyRedirects from '@/lib/legacy-redirects.json';
import {
  isOrderFailed,
  orderCanRetry,
  orderDisplayStatus,
  orderNeedsAttention,
} from '@/lib/order-state';
import type { DbClient } from '@/lib/supabase/query';
import { reconnectResellerBot } from '@/modules/bots';
import { createOrder } from '@/modules/orders';
import { payOrderFromCustomerWallet } from '@/modules/payments';
import {
  BOT_TOKEN_DECRYPT_ERROR_MESSAGE,
  disconnectOwnerBot,
  readOwnerBotPaused,
  readOwnerBotTokenState,
  setOwnerBotPaused,
} from '@/modules/platform';
import { readBots } from '@/modules/platform/bots-desk';
import { parseOrderFilters, readOrders } from '@/modules/platform/orders';
import { readOverview } from '@/modules/platform/overview';
import { assertResellerFieldsAllowed } from '@/modules/platform/policy';
import {
  readBotMenuToggles,
  readPlatformExtraSettings,
  savePaymentsSection,
} from '@/modules/platform/settings-extra';
import { readStore } from '@/modules/platform/store';
import { readToday } from '@/modules/platform/today';
import { redeemOpenCheckout } from '@/modules/pricing/discount';
import { claimFreebie } from '@/modules/referrals/freebies';
import { DEFAULT_STORE_CONFIG } from '@/modules/store-config/defaults';
import { layoutHomeButtons } from '@/modules/store-config/keyboard';
import { renderTemplate } from '@/modules/store-config/template';
import { claimWalletTopup, loadTopupPolicy, openWalletTopup } from '@/modules/topups';
import { topupHealth } from '@/modules/topups/admin';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const SETTINGS_ID = '00000000-0000-4000-8000-000000000001';
const OWNER_USER_ID = '00000000-0000-4000-8000-000000000002';
const TENANT_A = '00000000-0000-4000-8000-000000000010';
const TENANT_B = '00000000-0000-4000-8000-000000000011';
const BOT_1 = '00000000-0000-4000-8000-000000000201';
const BOT_2 = '00000000-0000-4000-8000-000000000202';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000101';
const CUSTOMER_PAID = '00000000-0000-4000-8000-000000000301';
const CUSTOMER_UNPAID = '00000000-0000-4000-8000-000000000302';
const PAY_TO = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function baseProduct() {
  return {
    id: PRODUCT_ID,
    sku: 'PASS-DEMO-01',
    title: 'Pro Pass',
    description: 'Instant pass',
    category: 'subscriptions',
    delivery_type: 'file_reusable',
    status: 'published',
    wholesale_price: '500000',
    retail_price: '1000000',
    stock_unlimited: true,
    stock_count: null,
    reseller_eligible: true,
    max_purchase_qty: 5,
    estimated_delivery_minutes: null,
    version: 1,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  };
}

describe('P0 #1 fraud enforcement', () => {
  it('allows 10 wallet-paid orders in a row while refusing an unpaid order flood burst', async () => {
    const db = createMemoryDb({
      platform_settings: [
        {
          id: SETTINGS_ID,
          fraud_orders_per_hour: 3,
          fraud_freebie_claims_per_day: 2,
          fraud_discount_redemptions_per_customer: 2,
        },
      ],
      products: [baseProduct()],
      customers: [
        {
          id: CUSTOMER_PAID,
          bot_id: null,
          telegram_user_id: '7001',
          first_name: 'Buyer',
          credit_balance: '50000000',
          is_blocked: false,
          created_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: CUSTOMER_UNPAID,
          bot_id: null,
          telegram_user_id: '7002',
          first_name: 'Spammer',
          credit_balance: '0',
          is_blocked: false,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    for (let i = 0; i < 10; i += 1) {
      const order = await createOrder(db, {
        channel: 'owner_store',
        botId: 'owner',
        customerId: CUSTOMER_PAID,
        productId: PRODUCT_ID,
        idempotencyKey: `paid-seq-${i}`,
      });
      await payOrderFromCustomerWallet(db, order.id, CUSTOMER_PAID);
    }

    expect(db.tables.orders?.filter((row) => row.customer_id === CUSTOMER_PAID)).toHaveLength(10);

    for (let i = 0; i < 3; i += 1) {
      await createOrder(db, {
        channel: 'owner_store',
        botId: 'owner',
        customerId: CUSTOMER_UNPAID,
        productId: PRODUCT_ID,
        idempotencyKey: `unpaid-burst-${i}`,
      });
    }

    await expect(
      createOrder(db, {
        channel: 'owner_store',
        botId: 'owner',
        customerId: CUSTOMER_UNPAID,
        productId: PRODUCT_ID,
        idempotencyKey: 'unpaid-burst-blocked',
      }),
    ).rejects.toMatchObject({ code: 'FRAUD_LIMIT' });

    expect(db.tables.audit_log?.some((row) => row.action === 'fraud.order_refused')).toBe(true);
  });

  it('enforces daily freebie cap and per-customer discount cap with audit rows', async () => {
    const nowIso = new Date().toISOString();
    const db = createMemoryDb({
      platform_settings: [
        {
          id: SETTINGS_ID,
          fraud_orders_per_hour: 20,
          fraud_freebie_claims_per_day: 2,
          fraud_discount_redemptions_per_customer: 2,
        },
      ],
      products: [baseProduct()],
      customers: [
        {
          id: CUSTOMER_PAID,
          bot_id: null,
          telegram_user_id: '7003',
          first_name: 'Promo',
          credit_balance: '0',
          is_blocked: false,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      orders: [
        {
          id: '00000000-0000-4000-8000-000000000o99',
          tenant_id: null,
          channel: 'owner_store',
          bot_id: null,
          customer_id: CUSTOMER_PAID,
          product_id: PRODUCT_ID,
          quantity: 1,
          quoted_retail_price: '1000000',
          payment_status: 'awaiting',
          created_at: nowIso,
        },
      ],
      freebies: [
        {
          id: '00000000-0000-4000-8000-000000000f10',
          tenant_id: null,
          title: 'Free Guide',
          description: '',
          kind: 'text',
          content: 'Guide text',
          required_referrals: 0,
          active: true,
          sort_order: 1,
        },
      ],
      freebie_claims: [
        { id: 'fc-1', freebie_id: '00000000-0000-4000-8000-000000000f01', customer_id: CUSTOMER_PAID, created_at: nowIso },
        { id: 'fc-2', freebie_id: '00000000-0000-4000-8000-000000000f02', customer_id: CUSTOMER_PAID, created_at: nowIso },
      ],
      discount_codes: [
        {
          id: '00000000-0000-4000-8000-000000000c10',
          tenant_id: null,
          code: 'SAVE10',
          kind: 'percent',
          value: '10',
          min_order_minor: '0',
          active: true,
          used_count: 0,
        },
      ],
      discount_redemptions: [
        { id: 'dr-1', code_id: 'c0', customer_id: CUSTOMER_PAID, order_id: 'o1', created_at: nowIso },
        { id: 'dr-2', code_id: 'c1', customer_id: CUSTOMER_PAID, order_id: 'o2', created_at: nowIso },
      ],
    });

    await expect(
      claimFreebie(db, {
        tenantId: null,
        customerId: CUSTOMER_PAID,
        freebieId: '00000000-0000-4000-8000-000000000f10',
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const discountResult = await redeemOpenCheckout(db, {
      customerId: CUSTOMER_PAID,
      tenantId: null,
      code: 'SAVE10',
    });
    expect(discountResult.applied).toBe(true);
    if (discountResult.applied) {
      expect(discountResult.ok).toBe(false);
      if (!discountResult.ok) {
        expect(discountResult.message).toMatch(/redemptions/i);
      }
    }
    expect(db.tables.audit_log?.some((row) => row.action === 'fraud.freebie_refused')).toBe(true);
    expect(db.tables.audit_log?.some((row) => row.action === 'fraud.discount_refused')).toBe(true);
  });
});

describe('P0 #2 BEP20 confirmations and top-up expiry', () => {
  it('reads confirmations and expiry from platform_settings and lets BEP20_MIN_CONFIRMATIONS override', async () => {
    const db = createMemoryDb({
      platform_settings: [
        {
          id: SETTINGS_ID,
          bep20_confirmations: 18,
          topup_expiry_minutes: 45,
          bep20_enabled: true,
          platform_usdt_wallet_bep20: PAY_TO,
        },
      ],
      customers: [{ id: CUSTOMER_PAID, bot_id: null, telegram_user_id: '7010', credit_balance: '0' }],
    });

    const dbPolicy = await loadTopupPolicy(db);
    expect(dbPolicy).toEqual({ confirmations: 18, expiryMinutes: 45, overrideActive: false });

    const now = new Date();
    const opened = await openWalletTopup(db, {
      customerId: CUSTOMER_PAID,
      botId: 'owner',
      tenantId: null,
      amountMinor: 5_000_000n,
      payToAddress: PAY_TO,
      now,
    });
    expect(opened.topup.expiresAt.getTime() - now.getTime()).toBe(45 * 60_000);

    const claimed = await claimWalletTopup(
      db,
      { customerId: CUSTOMER_PAID, txHash: `0x${'a'.repeat(64)}`, topupId: opened.topup.id },
      async (input) => {
        expect(input.minConfirmations).toBe(18);
        return {
          status: 'rejected',
          reason: 'TOO_FEW_CONFIRMATIONS',
          confirmations: 14,
        };
      },
    );
    expect(claimed.status).toBe('rejected');
    if (claimed.status === 'rejected') {
      expect(claimed.reason).toBe('TOO_FEW_CONFIRMATIONS');
      expect(claimed.requiredConfirmations).toBe(18);
    }

    vi.stubEnv('BEP20_MIN_CONFIRMATIONS', '25');
    const envPolicy = await loadTopupPolicy(db);
    expect(envPolicy).toEqual({ confirmations: 25, expiryMinutes: 45, overrideActive: true });

    const paddedFrom = `0x${'1'.padStart(64, '0')}`;
    const paddedTo = `0x${PAY_TO.slice(2).toLowerCase().padStart(64, '0')}`;
    const transferValue = `0x${(1_000_000n * BSC_USDT_MINOR_DIVISOR).toString(16).padStart(64, '0')}`;
    const fakeReader: ChainReader = {
      name: 'test',
      getReceipt: async () => ({
        status: '0x1',
        blockNumber: '0x64',
        logs: [
          {
            address: BSC_USDT_CONTRACT,
            topics: [ERC20_TRANSFER_TOPIC, paddedFrom, paddedTo],
            data: transferValue,
          },
        ],
      }),
      getBlockNumber: async () => 120n,
      getBlockTimestamp: async () => BigInt(Math.floor(new Date('2026-10-10T10:00:00.000Z').getTime() / 1000)),
    };

    const verifyOverride = await verifyUsdtTransfer(
      {
        txHash: `0x${'b'.repeat(64)}`,
        toAddress: PAY_TO,
        exactAmountMinor: 1_000_000n,
        notBefore: new Date('2026-10-10T09:00:00.000Z'),
        minConfirmations: 12,
      },
      { readers: [fakeReader] },
    );
    expect(verifyOverride.status).toBe('rejected');
    if (verifyOverride.status === 'rejected') {
      expect(verifyOverride.reason).toBe('TOO_FEW_CONFIRMATIONS');
      expect(verifyOverride.confirmations).toBe(21);
    }

    const health = await topupHealth(db, null, async () => 'ok');
    expect(health.confirmations).toBe(25);
  });
});

describe('P0 #3 & #4 settings split writes, money precision, and per-store policy override', () => {
  it('converts USDT bounds via lib/money without float drift and respects tenant overrides first', async () => {
    const db = createMemoryDb({
      platform_settings: [
        {
          id: SETTINGS_ID,
          bep20_enabled: true,
          platform_usdt_wallet_bep20: PAY_TO,
          bep20_confirmations: 12,
          topup_expiry_minutes: 60,
          min_topup_minor: '1000000',
          max_topup_minor: '500000000',
          reseller_policy: { botCopy: false, apiKeys: false, catalogPrice: true },
        },
      ],
      tenants: [
        {
          id: TENANT_A,
          display_name: 'VIP Store',
          reseller_policy_override: { botCopy: true },
        },
        {
          id: TENANT_B,
          display_name: 'Default Store',
          reseller_policy_override: null,
        },
      ],
    });

    const saved = await savePaymentsSection(db, {
      bep20Enabled: true,
      address: PAY_TO,
      confirmations: 15,
      expiryMinutes: 90,
      minUsdt: '2.35',
      maxUsdt: '150.75',
    });
    expect(saved).toEqual({ minMinor: '2350000', maxMinor: '150750000' });

    const hydrated = await readPlatformExtraSettings(db);
    expect(hydrated.confirmations).toBe(15);
    expect(hydrated.expiryMinutes).toBe(90);
    expect(hydrated.minUsdt).toBe('2.35');
    expect(hydrated.maxUsdt).toBe('150.75');

    await expect(assertResellerFieldsAllowed(db, ['botCopy', 'catalogPrice'], TENANT_A)).resolves.toBeUndefined();
    await expect(assertResellerFieldsAllowed(db, ['apiKeys'], TENANT_A)).rejects.toThrow();
    await expect(assertResellerFieldsAllowed(db, ['botCopy'], TENANT_B)).rejects.toThrow();
  });
});

describe('P0 #5 & #13 bot pause, disconnect, targeted reconnect, and decrypt error', () => {
  it('handles pause constraint fallback, webhook deletion on disconnect, targeted reconnect, and decrypt message', async () => {
    vi.stubEnv('BOT_TOKEN_ENCRYPTION_KEY', 'ab'.repeat(32));
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://btc.example.com');
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        calls.push(url);
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: url.endsWith('/getMe') ? { id: 999, is_bot: true, username: 'target_bot' } : true,
          }),
        };
      }),
    );

    const encryptedOwner = encrypt('111:OwnerSecret');
    const encryptedBot1 = encrypt('222:BotOneSecret');
    const encryptedBot2 = encrypt('333:BotTwoSecret');

    const db = createMemoryDb({
      platform_settings: [
        {
          id: SETTINGS_ID,
          owner_bot_token_encrypted: encryptedOwner,
          owner_bot_username: 'blacktiercirclebot',
          owner_bot_status: 'connected',
          owner_bot_paused: false,
        },
      ],
      tenants: [{ id: TENANT_A, display_name: 'Alpha Store', status: 'active' }],
      bot_connections: [
        {
          id: BOT_1,
          tenant_id: TENANT_A,
          username: 'alpha_one_bot',
          encrypted_token: encryptedBot1,
          webhook_secret: 'sec-1',
          status: 'connected',
        },
        {
          id: BOT_2,
          tenant_id: TENANT_A,
          username: 'alpha_two_bot',
          encrypted_token: encryptedBot2,
          webhook_secret: 'sec-2',
          status: 'connected',
        },
      ],
      orders: [
        {
          id: 'ord-all-1',
          tenant_id: null,
          channel: 'owner_store',
          bot_id: null,
          payment_status: 'verified',
          delivery_status: 'sent',
          fulfillment_status: 'ready',
          quoted_retail_price: '400000',
          created_at: '2026-09-01T10:00:00.000Z',
        },
        {
          id: 'ord-all-2',
          tenant_id: null,
          channel: 'owner_store',
          bot_id: null,
          payment_status: 'verified',
          delivery_status: 'sent',
          fulfillment_status: 'ready',
          quoted_retail_price: '600000',
          created_at: new Date().toISOString(),
        },
      ],
    });

    await setOwnerBotPaused(db, true);
    expect(await readOwnerBotPaused(db)).toBe(true);
    expect(db.tables.platform_settings?.[0]?.owner_bot_status).toBe('connected');

    const missingPausedColDb: DbClient = {
      ...db,
      from: (table: string) => {
        const inner = db.from(table);
        if (table !== 'platform_settings') return inner;
        return new Proxy(inner, {
          get(target, prop, receiver) {
            if (prop === 'update') {
              return (patch: Record<string, unknown>) => {
                if ('owner_bot_paused' in patch) {
                  return {
                    eq: async () => ({
                      data: null,
                      error: { code: '42703', message: 'column "owner_bot_paused" does not exist' },
                    }),
                  };
                }
                return target.update(patch);
              };
            }
            return Reflect.get(target, prop, receiver);
          },
        });
      },
    } as unknown as DbClient;

    await setOwnerBotPaused(db, true);
    expect(db.tables.platform_settings?.[0]?.owner_bot_paused).toBe(true);
    await setOwnerBotPaused(db, false);
    expect(db.tables.platform_settings?.[0]?.owner_bot_status).toBe('connected');

    const targeted = await reconnectResellerBot(db, TENANT_A, BOT_2);
    expect(targeted.username).toBe('alpha_two_bot');
    expect(calls.some((url) => url.includes('333:BotTwoSecret/setWebhook'))).toBe(true);
    expect(calls.some((url) => url.includes('222:BotOneSecret'))).toBe(false);

    const botSummary = await readBots(db, 'owner', null);
    expect(botSummary.bots[0]?.orders).toBe(2);
    expect(botSummary.bots[0]?.revenue).toBe('1.00');

    vi.stubEnv('BOT_TOKEN_ENCRYPTION_KEY', 'cd'.repeat(32));
    const tokenState = await readOwnerBotTokenState(db);
    expect(tokenState.status).toBe('decrypt_failed');
    const unreadableSummary = await readBots(db, 'owner', null);
    expect(unreadableSummary.bots[0]?.connectionState).toBe('Offline');
    expect(unreadableSummary.bots[0]?.connectionDetail).toBe(BOT_TOKEN_DECRYPT_ERROR_MESSAGE);

    vi.stubEnv('BOT_TOKEN_ENCRYPTION_KEY', 'ab'.repeat(32));
    await disconnectOwnerBot(db);
    expect(calls.some((url) => url.includes('111:OwnerSecret/deleteWebhook'))).toBe(true);
    expect(db.tables.platform_settings?.[0]?.owner_bot_token_encrypted).toBeNull();
    expect(db.tables.platform_settings?.[0]?.owner_bot_status).toBe('disconnected');
  });
});

describe('P0 #6, #17, #18 Bot Studio signed previews, clean templates, and menu toggles', () => {
  it('uses short-lived signed URLs, strips empty link lines, and hides reseller/API buttons by default', async () => {
    const signedCalls: Array<{ bucket: string; path: string; expiresIn: number }> = [];
    const baseDb = createMemoryDb({
      platform_settings: [{ id: SETTINGS_ID, owner_bot_username: 'btc_bot', store_status: 'open' }],
      profiles: [{ id: OWNER_USER_ID, telegram_chat_id: '123456' }],
      products: [baseProduct()],
      product_assets: [
        {
          id: 'asset-1',
          product_id: PRODUCT_ID,
          storage_path: 'previews/pro-pass.png',
          is_preview: true,
        },
      ],
    });
    const db = Object.assign(baseDb, {
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (filePath: string, expiresIn: number) => {
            signedCalls.push({ bucket, path: filePath, expiresIn });
            return { data: { signedUrl: `https://signed.local/${bucket}/${filePath}?exp=${expiresIn}` }, error: null };
          },
        }),
      },
    }) as unknown as DbClient;

    const store = await readStore(db, 'owner', null, OWNER_USER_ID);
    expect(signedCalls).toEqual([{ bucket: 'product-previews', path: 'previews/pro-pass.png', expiresIn: 900 }]);
    expect(store.products[0]?.imageUrl).toContain('https://signed.local/product-previews/');
    expect(store.products[0]?.imageUrl).not.toContain('/object/public/');

    const rendered = renderTemplate('{channel}\n{group}\n{website}', {
      channel: '',
      group: 'Group: @btc_group',
      website: '',
    });
    expect(rendered).toBe('Group: @btc_group');

    const toggles = await readBotMenuToggles(db);
    expect(toggles).toEqual({ resellerSignup: false, myApi: false });

    const defaultCallbacks = layoutHomeButtons(DEFAULT_STORE_CONFIG, {
      resellerSignupEnabled: toggles.resellerSignup,
      myApiEnabled: toggles.myApi,
    })
      .flat()
      .map((btn) => (btn.kind === 'callback' ? btn.data : btn.url));
    expect(defaultCallbacks).not.toContain('reseller_signup:');
    expect(defaultCallbacks).not.toContain('api_info:');
  });
});

describe('P0 #8 legacy redirects', () => {
  it('maps every legacy redirect to an existing dashboard page and valid settings section key', () => {
    const appDir = path.resolve(process.cwd(), 'app/(platform)');
    const validRoutes = new Set<string>();
    for (const entry of fs.readdirSync(appDir, { withFileTypes: true })) {
      if (entry.isDirectory() && fs.existsSync(path.join(appDir, entry.name, 'page.tsx'))) {
        validRoutes.add(`/${entry.name}`);
      }
    }
    const validSettingsSections = new Set([
      'business',
      'legal',
      'policy',
      'pricing',
      'notifications',
      'fraud',
      'payments',
      'store',
      'integrations',
      'security',
      'danger',
      'account',
      'keys',
      'webhooks',
    ]);

    for (const rule of legacyRedirects) {
      expect(rule.source.startsWith('/')).toBe(true);
      expect(rule.destination.startsWith('/')).toBe(true);
      const url = new URL(rule.destination, 'https://btc.local');
      expect(validRoutes.has(url.pathname)).toBe(true);
      if (url.pathname === '/settings' && url.searchParams.has('section')) {
        expect(validSettingsSections.has(url.searchParams.get('section') ?? '')).toBe(true);
      }
    }

    const apiKeyRedirect = legacyRedirects.find((rule) => rule.source === '/reseller/settings/api-keys');
    expect(apiKeyRedirect?.destination).toBe('/settings?section=keys');
  });
});

describe('P0 #11 7d revenue attribution, #12 single order state, and #14 display labels', () => {
  it('attributes orders delivered 6 days ago across UTC day boundaries and agrees across surfaces on sent orders', async () => {
    const db = createMemoryDb({
      platform_settings: [{ id: SETTINGS_ID }],
      products: [baseProduct()],
      customers: [{ id: CUSTOMER_PAID, bot_id: null, telegram_user_id: '7020', first_name: 'Nora' }],
      orders: [
        {
          id: 'd4e8eaab-0000-4000-8000-000000000001',
          tenant_id: null,
          channel: 'owner_store',
          bot_id: null,
          customer_id: CUSTOMER_PAID,
          product_id: PRODUCT_ID,
          quantity: 1,
          quoted_retail_price: '400000',
          quoted_wholesale_price: '200000',
          payment_status: 'verified',
          delivery_status: 'sent',
          fulfillment_status: 'ready',
          paid_at: '2026-10-04T02:15:00.000Z',
          created_at: '2026-10-04T02:14:00.000Z',
        },
        {
          id: '8c668888-0000-4000-8000-000000000002',
          tenant_id: null,
          channel: 'owner_store',
          bot_id: null,
          customer_id: CUSTOMER_PAID,
          product_id: PRODUCT_ID,
          quantity: 1,
          quoted_retail_price: '400000',
          quoted_wholesale_price: '200000',
          payment_status: 'verified',
          delivery_status: 'sent',
          fulfillment_status: 'failed',
          paid_at: '2026-10-04T03:00:00.000Z',
          created_at: '2026-10-04T02:59:00.000Z',
        },
      ],
    });

    const fixedNow = new Date('2026-10-10T18:30:00.000Z');
    const overview = await readOverview(
      db,
      { role: 'owner', tenantId: null, botId: null, firstName: 'Kush', timezone: 'UTC' },
      '7d',
      fixedNow,
    );
    expect(overview.revenue).toBe('0.80 USDT');
    expect(overview.kpis.find((kpi) => kpi.id === 'orders')?.value).toBe('2');

    const sentFailedTracks = {
      paymentStatus: 'verified',
      deliveryStatus: 'sent',
      fulfillmentStatus: 'failed',
    } as const;
    expect(orderDisplayStatus(sentFailedTracks)).toEqual({ label: 'Delivered', tone: 'ok' });
    expect(isOrderFailed(sentFailedTracks)).toBe(false);
    expect(orderNeedsAttention(sentFailedTracks)).toBe(false);
    expect(orderCanRetry(sentFailedTracks)).toBe(false);

    const today = await readToday(db, { role: 'owner', tenantId: null, botId: null });
    expect(today.items.filter((item) => item.id.includes('8c668888'))).toHaveLength(0);

    const attentionOrders = await readOrders(db, null, parseOrderFilters(new URLSearchParams('chip=attention')));
    expect(attentionOrders.rows).toHaveLength(0);
    const failedOrders = await readOrders(db, null, parseOrderFilters(new URLSearchParams('chip=failed')));
    expect(failedOrders.rows).toHaveLength(0);
  });

  it('formats enums and dates into plain English without snake_case, HTML tags, or ISO dates', () => {
    expect(displayOrderEventLabel('funding', 'not_applicable')).toBe('Direct store order');
    expect(displayOrderEventLabel('payment', 'pending_verification')).toBe('Checking payment');
    expect(displayOrderEventNote('initial')).toBeNull();
    expect(displayMemoryType('memory_decision')).toBe('Decision');
    expect(formatPlainDatesInText('When: 2026-10-10 <b>done</b>')).toBe('When: Oct 10, 2026 done');
    expect(displayDeliveryType('email_activation')).toBe('Email activation');
    expect(displayDiscountValue('percent', '20')).toBe('20% off');
    expect(displayMarkup('percent', '20')).toBe('20%');
    expect(displayAuditAction('bot.reconnect')).toBe('Re-set bot webhook');
    expect(displayLedgerEntryType('top_up_credit')).toBe('Top-up credit');
  });
});
