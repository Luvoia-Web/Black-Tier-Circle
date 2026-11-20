import { afterEach, describe, expect, it, vi } from 'vitest';

import { recallWithOutcome } from '@/lib/hindsight';
import { availableOrderDrawerActions, buildOrderTimeline, toSentenceCase } from '@/lib/order-detail';
import { ownerBotDisplayName, resolveBotLiveStatus } from '@/lib/owner-bot';
import { isProductionDemoAllowed, paymentSandboxEnabled } from '@/lib/payment-config';
import { buildZonedRange, resolveBusinessTimezone, zonedBucketKey } from '@/lib/period';
import { productInitials } from '@/lib/product-labels';
import { isProductionAppUrl } from '@/modules/launch';
import { scheduleBroadcast } from '@/modules/platform/growth';
import { setOwnerBotPaused } from '@/modules/platform';
import { payloadForFailure } from '@/modules/platform/intelligence';
import { readOverview } from '@/modules/platform/overview';
import { ownerReplace } from '@/modules/platform/replacements';
import { saveBotMenuToggles, savePaymentDemoMode, savePaymentsSection } from '@/modules/platform/settings-extra';
import { readSystemHealth } from '@/modules/platform/system-health';
import { describeVerifierStatus } from '@/modules/topups/admin';
import { ValidationError } from '@/lib/errors';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('Phase A-fix — Intelligence timeout vs failure (#1)', () => {
  it('treats timeout as loading (not unavailable) and only real errors as unavailable', async () => {
    vi.useFakeTimers();
    const slowPromise = recallWithOutcome('btc-platform', 'platform activity', {
      timeoutMs: 200,
      recall: () => new Promise(() => {}),
    });
    await vi.advanceTimersByTimeAsync(250);
    const timeoutResult = await slowPromise;
    expect(timeoutResult.kind).toBe('timeout');

    const loadingPayload = payloadForFailure('timeout');
    expect(loadingPayload.bankState).toBe('loading');
    expect(loadingPayload.degraded).toBe(false);
    expect(loadingPayload.timedOut).toBe(true);

    const errResult = await recallWithOutcome('btc-platform', 'platform activity', {
      timeoutMs: 1000,
      recall: async () => {
        throw new Error('502 Bad Gateway');
      },
    });
    expect(errResult.kind).toBe('error');

    const errorPayload = payloadForFailure('error');
    expect(errorPayload.bankState).toBe('unavailable');
    expect(errorPayload.degraded).toBe(true);
  });
});

describe('Phase A-fix — Payment mode & production lock (#2)', () => {
  it('makes Demo mode impossible in production unless PAYMENT_DEMO_ALLOW_PROD=true', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PAYMENT_SANDBOX', 'true');
    vi.stubEnv('PAYMENT_DEMO_ALLOW_PROD', '');

    expect(isProductionDemoAllowed()).toBe(false);
    expect(paymentSandboxEnabled()).toBe(false);
    expect(paymentSandboxEnabled(true)).toBe(false);

    const db = createMemoryDb({
      platform_settings: [{ id: 'ps-1', payment_demo_mode: false }],
    });
    await expect(savePaymentDemoMode(db, true)).rejects.toThrow(ValidationError);

    vi.stubEnv('PAYMENT_DEMO_ALLOW_PROD', 'true');
    expect(isProductionDemoAllowed()).toBe(true);
    expect(paymentSandboxEnabled(true)).toBe(true);
    const saved = await savePaymentDemoMode(db, true);
    expect(saved.paymentMode).toBe('demo');
  });
});

describe('Phase A-fix — System health URL & job queue USDT (#3)', () => {
  it('passes NEXT_PUBLIC_APP_URL only for https non-localhost domains', () => {
    expect(isProductionAppUrl(undefined)).toBe(false);
    expect(isProductionAppUrl('http://localhost:3000')).toBe(false);
    expect(isProductionAppUrl('https://localhost:3000')).toBe(false);
    expect(isProductionAppUrl('http://127.0.0.1:3000')).toBe(false);
    expect(isProductionAppUrl('http://blacktiercircle.vercel.app')).toBe(false);
    expect(isProductionAppUrl('https://blacktiercircle.vercel.app')).toBe(true);
  });

  it('never duplicates USDT in the active job queue detail', async () => {
    const db = createMemoryDb({
      platform_settings: [
        {
          id: 'ps-1',
          platform_name: 'Black Tier Circle',
          owner_bot_status: 'connected',
          owner_bot_username: 'btc_owner_bot',
          owner_bot_paused: false,
        },
      ],
      suppliers: [],
      supplier_balance_snapshots: [],
      bot_connections: [],
      tenants: [],
      products: [
        {
          id: 'prod-1',
          sku: 'NFLX-1M',
          title: 'Netflix 1M',
          status: 'published',
          delivery_type: 'manual',
          wholesale_price: '10000000',
          retail_price: '12500000',
          owner_retail_price: '12500000',
          min_reseller_price: '11000000',
          stock_count: 5,
          stock_unlimited: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      orders: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          tenant_id: null,
          product_id: 'prod-1',
          quantity: 1,
          quoted_retail_price: '12500000',
          payment_status: 'verified',
          fulfillment_status: 'processing',
          delivery_status: 'queued',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      fulfillment_attempts: [],
      audit_log: [],
      broadcasts: [],
    });

    const health = await readSystemHealth(db);
    expect(health.jobQueue).toHaveLength(1);
    expect(health.jobQueue[0]?.detail).toContain('12.50 USDT');
    expect(health.jobQueue[0]?.detail).not.toContain('USDT USDT');
  });
});

describe('Phase A-fix — Order drawer actions, timeline & replace reason (#5 & #6)', () => {
  it('hides Cancel and Mark fulfilled for delivered orders and builds normalized timeline', () => {
    const delivered = availableOrderDrawerActions({ deliveryStatus: 'sent' });
    expect(delivered.canCancel).toBe(false);
    expect(delivered.canMarkFulfilled).toBe(false);
    expect(delivered.canReplace).toBe(true);

    const pending = availableOrderDrawerActions({ deliveryStatus: 'queued' });
    expect(pending.canCancel).toBe(true);
    expect(pending.canMarkFulfilled).toBe(true);
    expect(pending.canReplace).toBe(false);

    expect(toSentenceCase('payment verified via wallet')).toBe('Payment verified via wallet');

    const timeline = buildOrderTimeline(
      [
        {
          track: 'payment',
          to: 'verified',
          label: 'Payment verified',
          at: '2026-11-20T05:00:00.000Z',
          note: 'wallet balance debited',
        },
        {
          track: 'fulfillment',
          to: 'failed',
          label: 'Fulfillment failed',
          at: '2026-11-20T05:01:00.000Z',
          note: 'temporary supplier timeout',
        },
        {
          track: 'fulfillment',
          to: 'ready',
          label: 'Item ready',
          at: '2026-11-20T05:02:00.000Z',
          note: 'item received',
        },
      ],
      {
        deliveryStatus: 'sent',
        deliveredAt: '2026-11-20T05:03:00.000Z',
        supplierReason: null,
      },
    );

    expect(timeline[0]?.note).toBe('Wallet balance debited');
    expect(timeline[1]?.label).toBe('Supplier attempt failed, retried');
    expect(timeline[1]?.tone).toBe('neutral');
    expect(timeline[timeline.length - 1]?.label).toBe('Delivered');
    expect(timeline[timeline.length - 1]?.tone).toBe('ok');
  });

  it('requires a reason before ownerReplace acts', async () => {
    const db = createMemoryDb({ orders: [] });
    await expect(
      ownerReplace(db, {
        orderId: '11111111-1111-4111-8111-111111111111',
        actorId: 'owner-1',
        mode: 'manual',
        content: 'KEY-123',
        reason: '   ',
      }),
    ).rejects.toThrow(/reason/i);
  });
});

describe('Phase A-fix — Charts dense buckets & business timezone (#7 & #14)', () => {
  it('spans the full 7d, 30d, and 12m ranges with zeros for empty days', async () => {
    const now = new Date('2026-11-20T06:30:00.000Z'); // 12:00 IST
    expect(buildZonedRange('7d', now, 'Asia/Kolkata').buckets).toHaveLength(7);
    expect(buildZonedRange('30d', now, 'Asia/Kolkata').buckets).toHaveLength(30);
    expect(buildZonedRange('12m', now, 'Asia/Kolkata').buckets).toHaveLength(12);
    expect(resolveBusinessTimezone('Not/A_Zone')).toBe('Asia/Kolkata');

    const db = createMemoryDb({
      orders: [
        {
          id: 'o-1',
          tenant_id: null,
          channel: 'owner_store',
          payment_status: 'verified',
          fulfillment_status: 'ready',
          delivery_status: 'sent',
          quoted_retail_price: '5000000',
          quantity: 1,
          created_at: '2026-11-14T10:00:00.000Z',
          customer_id: 'c-1',
          product_id: 'p-1',
        },
        {
          id: 'o-2',
          tenant_id: null,
          channel: 'owner_store',
          payment_status: 'verified',
          fulfillment_status: 'ready',
          delivery_status: 'sent',
          quoted_retail_price: '3000000',
          quantity: 1,
          created_at: '2026-11-20T05:00:00.000Z',
          customer_id: 'c-1',
          product_id: 'p-1',
        },
      ],
      products: [{ id: 'p-1', title: 'Test Product' }],
      customers: [{ id: 'c-1', username: 'asha', first_name: 'Asha' }],
      tenants: [],
      suppliers: [],
      support_threads: [],
      payment_claims: [],
      replacement_requests: [],
      wallet_topups: [],
      bot_connections: [],
      platform_settings: [{ id: 'ps-1', owner_bot_status: 'connected' }],
    });

    const overview = await readOverview(
      db,
      { role: 'owner', tenantId: null, botId: null, firstName: 'Kush', timezone: 'Asia/Kolkata' },
      '7d',
      now,
    );
    expect(overview.series).toHaveLength(7);
    expect(overview.series[0]?.owner).toBe(5);
    expect(overview.series[1]?.owner).toBe(0);
    expect(overview.series[6]?.owner).toBe(3);
  });

  it('counts an order at 01:00 IST as today in Asia/Kolkata (and not in UTC)', () => {
    const now = new Date('2026-11-20T06:30:00.000Z'); // 2026-11-20 12:00 IST
    const orderAt0100Ist = new Date('2026-11-19T19:30:00.000Z'); // 2026-11-20 01:00 IST

    const istRange = buildZonedRange('today', now, 'Asia/Kolkata');
    expect(orderAt0100Ist.getTime() >= istRange.start.getTime()).toBe(true);
    expect(zonedBucketKey('today', orderAt0100Ist.toISOString(), 'Asia/Kolkata')).toBe('0');

    const utcRange = buildZonedRange('today', now, 'UTC');
    expect(orderAt0100Ist.getTime() >= utcRange.start.getTime()).toBe(false);
  });
});

describe('Phase A-fix — Payments guard, verifier reason, initials, bot status & 0036/0037 paths (#8, #9, #10, DB facts)', () => {
  it('blocks enabling BEP20 without a valid address and explains offline verifier without secrets', async () => {
    const db = createMemoryDb({
      platform_settings: [{ id: 'ps-1', bep20_enabled: false, platform_usdt_wallet_bep20: null }],
    });
    await expect(
      savePaymentsSection(db, {
        bep20Enabled: true,
        address: '',
        confirmations: 12,
        expiryMinutes: 60,
        minUsdt: '1',
        maxUsdt: '100',
      }),
    ).rejects.toThrow(/valid BEP20/i);

    const noAddr = describeVerifierStatus({ hasAddress: false, provider: 'down' });
    expect(noAddr).toContain('No receiving BEP20 address');

    const secretKey = 'SUPER_SECRET_ETHERSCAN_KEY_999';
    const offline = describeVerifierStatus({
      hasAddress: true,
      provider: 'down',
      env: { BSC_RPC_URLS: '', ETHERSCAN_API_KEY: secretKey },
    });
    expect(offline).toContain('BSC_RPC_URLS');
    expect(offline).not.toContain(secretKey);
  });

  it('strips brackets and symbols when computing product initials', () => {
    expect(productInitials('[KEY] HMA VPN')).toBe('HV');
    expect(productInitials('ChatGPT Plus')).toBe('CP');
    expect(productInitials('(1M) Netflix')).toBe('NE');
    expect(productInitials('***')).toBe('PR');
  });

  it('resolves bot status Online / Idle / Offline / Paused and unifies owner bot name', () => {
    const now = new Date('2026-11-20T12:00:00.000Z');
    expect(ownerBotDisplayName('btc_store_bot')).toBe('@btc_store_bot');
    expect(ownerBotDisplayName('@btc_store_bot')).toBe('@btc_store_bot');
    expect(ownerBotDisplayName(null)).toBe('Owner bot');

    expect(
      resolveBotLiveStatus({
        storedStatus: 'connected',
        lastUpdateAt: '2026-11-20T10:00:00.000Z',
        now,
      }).status,
    ).toBe('Online');

    expect(
      resolveBotLiveStatus({
        storedStatus: 'connected',
        lastUpdateAt: '2026-11-18T10:00:00.000Z',
        now,
      }).status,
    ).toBe('Idle');

    expect(resolveBotLiveStatus({ storedStatus: 'connected', paused: true, now }).status).toBe('Paused');
    expect(resolveBotLiveStatus({ storedStatus: 'error', now }).status).toBe('Offline');
    expect(resolveBotLiveStatus({ storedStatus: 'connected', webhookSet: false, now }).status).toBe('Offline');
  });

  it('exercises real 0036 and 0037 paths without migration fallbacks', async () => {
    const db = createMemoryDb({
      platform_settings: [
        {
          id: 'ps-1',
          owner_bot_status: 'connected',
          owner_bot_token_encrypted: 'enc',
          owner_bot_paused: false,
          bot_show_reseller_signup: false,
          bot_show_my_api: false,
        },
      ],
      customers: [{ id: 'c-1', bot_id: null, telegram_chat_id: '123456', is_blocked: false }],
      orders: [],
      broadcasts: [],
      audit_log: [],
    });

    await setOwnerBotPaused(db, true);
    expect(db.tables.platform_settings?.[0]?.owner_bot_paused).toBe(true);

    await saveBotMenuToggles(db, { resellerSignup: true, myApi: true });
    expect(db.tables.platform_settings?.[0]?.bot_show_reseller_signup).toBe(true);
    expect(db.tables.platform_settings?.[0]?.bot_show_my_api).toBe(true);

    const future = new Date(Date.now() + 3600_000).toISOString();
    const scheduled = await scheduleBroadcast(db, {
      role: 'owner',
      tenantId: null,
      botId: null,
      actorId: 'owner-1',
      body: '<b>Flash sale</b>',
      imageUrl: '',
      audience: 'all',
      scheduledFor: future,
    });
    expect(scheduled.recipients).toBe(1);
    expect(db.tables.broadcasts).toHaveLength(1);
  });
});
