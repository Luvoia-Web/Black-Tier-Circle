import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';
import { formatUsdt, formatUsdtInput, usdtToMinor } from '@/lib/money';
import { DEFAULT_REFERRAL_CONFIG, DEFAULT_STORE_CONFIG } from '@/modules/store-config/defaults';
import { renderTemplate } from '@/modules/store-config/template';
import { referralDraftFrom } from '@/components/growth/growth-panel';
import { buildRemyLiveContext, buildRemySystemPrompt } from '@/modules/platform/remy-context';
import { resolveStudioStoreName } from '@/modules/platform/store';
import { resolveBotContext } from '@/integrations/telegram/bot-context';
import { freebieListText, referralHomeText } from '@/modules/referrals/screens';
import { readSupplierDesk } from '@/modules/platform/supplier-desk';
import {
  markSupplierManuallyCompleted,
  markSupplierManuallyFailed,
  resubmitSupplierOrder,
} from '@/modules/fulfillment/supplier';

const { mockRequireRole, mockRequireReseller, mockConsumeRateLimit } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(),
  mockRequireReseller: vi.fn(),
  mockConsumeRateLimit: vi.fn().mockResolvedValue({ allowed: true, count: 1 }),
}));

vi.mock('@/lib/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/session')>('@/lib/auth/session');
  return {
    ...actual,
    requireRole: mockRequireRole,
    requireReseller: mockRequireReseller,
  };
});

vi.mock('@/lib/rate-limiter', () => ({
  consumeRateLimit: mockConsumeRateLimit,
}));

import { POST as assistantPost } from '@/app/api/assistant/route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  mockConsumeRateLimit.mockResolvedValue({ allowed: true, count: 1 });
});

describe('Pre-launch fix 1: Remy live data grounding & tenant isolation', () => {
  const NOW = new Date('2026-11-21T07:00:00.000Z');
  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const TENANT_B = '22222222-2222-4222-8222-222222222222';
  const PROD_1 = '33333333-3333-4333-8333-333333333333';
  const PROD_2 = '44444444-4444-4444-8444-444444444444';

  function createSeededDb() {
    return createMemoryDb({
      orders: [
        // 3 failed orders from October 2026 (NOT this month), all Failed at supplier
        {
          id: 'aaaaaaaa-0000-4000-8000-000000000001',
          tenant_id: null,
          product_id: PROD_1,
          quantity: 1,
          quoted_retail_price: '5000000',
          payment_status: 'verified',
          fulfillment_status: 'failed',
          delivery_status: 'not_ready',
          created_at: '2026-10-12T10:00:00.000Z',
        },
        {
          id: 'aaaaaaaa-0000-4000-8000-000000000002',
          tenant_id: null,
          product_id: PROD_1,
          quantity: 1,
          quoted_retail_price: '5000000',
          payment_status: 'verified',
          fulfillment_status: 'failed',
          delivery_status: 'not_ready',
          created_at: '2026-10-15T10:00:00.000Z',
        },
        {
          id: 'aaaaaaaa-0000-4000-8000-000000000003',
          tenant_id: TENANT_B,
          product_id: PROD_2,
          quantity: 1,
          quoted_retail_price: '8000000',
          payment_status: 'verified',
          fulfillment_status: 'failed',
          delivery_status: 'not_ready',
          created_at: '2026-10-18T10:00:00.000Z',
        },
        // 1 delivered order in November 2026 for owner (must NOT count as failed)
        {
          id: '8c668888-0000-4000-8000-000000000004',
          tenant_id: null,
          product_id: PROD_1,
          quantity: 1,
          quoted_retail_price: '12000000',
          payment_status: 'verified',
          fulfillment_status: 'ready',
          delivery_status: 'sent',
          created_at: '2026-11-10T10:00:00.000Z',
        },
        // 1 delivered order for Tenant A in November 2026
        {
          id: 'bbbbbbbb-0000-4000-8000-000000000005',
          tenant_id: TENANT_A,
          product_id: PROD_1,
          quantity: 2,
          quoted_retail_price: '14000000',
          payment_status: 'verified',
          fulfillment_status: 'ready',
          delivery_status: 'sent',
          created_at: '2026-11-12T10:00:00.000Z',
        },
        // 1 failed order for Tenant A in October 2026
        {
          id: 'bbbbbbbb-0000-4000-8000-000000000006',
          tenant_id: TENANT_A,
          product_id: PROD_1,
          quantity: 1,
          quoted_retail_price: '7000000',
          payment_status: 'verified',
          fulfillment_status: 'failed',
          delivery_status: 'not_ready',
          created_at: '2026-10-20T10:00:00.000Z',
        },
      ],
      fulfillment_attempts: [
        {
          id: 'att-1',
          order_id: 'aaaaaaaa-0000-4000-8000-000000000001',
          method: 'supplier',
          status: 'failed',
          error: 'ProdSeller out of stock',
          started_at: '2026-10-12T10:01:00.000Z',
        },
        {
          id: 'att-2',
          order_id: 'bbbbbbbb-0000-4000-8000-000000000006',
          method: 'supplier',
          status: 'failed',
          error: 'Canboso balance 0.36 USDT too low',
          started_at: '2026-10-20T10:01:00.000Z',
        },
      ],
      products: [
        { id: PROD_1, title: 'Gemini 18 Months', status: 'published', supplier_price_minor: '2000000' },
        { id: PROD_2, title: 'Secret Rival Product', status: 'published', supplier_price_minor: '3000000' },
      ],
      reseller_listings: [
        { id: 'list-1', tenant_id: TENANT_A, product_id: PROD_1, is_visible: true },
        { id: 'list-2', tenant_id: TENANT_B, product_id: PROD_2, is_visible: true },
      ],
      suppliers: [
        { id: 'sup-1', name: 'ProdSeller', status: 'active', balance_usdt: 12.5, last_sync_at: '2026-11-21T06:00:00.000Z', last_sync_error: null },
        { id: 'sup-2', name: 'Canboso', status: 'active', balance_usdt: 0.36, last_sync_at: '2026-11-21T06:05:00.000Z', last_sync_error: null },
      ],
      tenants: [
        { id: TENANT_A, owner_user_id: 'reseller-a', display_name: 'Alpha Reseller', business_name: 'Alpha Store', status: 'active' },
        { id: TENANT_B, owner_user_id: 'reseller-b', display_name: 'Bravo Reseller', business_name: 'Bravo Secret Store', status: 'active' },
      ],
      wallets: [
        { id: 'wal-a', tenant_id: TENANT_A, balance_total: '25000000' },
        { id: 'wal-b', tenant_id: TENANT_B, balance_total: '99000000' },
      ],
      audit_log: [],
    });
  }

  it('includes the real failed-order counts (0 this month, 4 all time) and reasons in the owner system prompt sent to Groq', async () => {
    const db = createSeededDb();
    const ctx = await buildRemyLiveContext(db, { role: 'owner', tenantId: null, timezone: 'Asia/Kolkata' }, NOW);

    expect(ctx.periods.thisMonth.failedOrders).toBe(0);
    expect(ctx.periods.allTime.failedOrders).toBe(4);
    expect(ctx.failedReasonCountsAllTime['Failed at supplier']).toBe(4);
    expect(ctx.suppliers.map((s) => s.name)).toEqual(['Canboso', 'ProdSeller']);

    const prompt = buildRemySystemPrompt('owner', ctx);
    expect(prompt).toContain('0 failed in November 2026');
    expect(prompt).toContain('4 failed all time (reasons: Failed at supplier: 4)');
    expect(prompt).toContain('ProdSeller: status active, balance 12.50 USDT');
    expect(prompt).toContain('Canboso: status active, balance 0.36 USDT');
    expect(prompt).toContain('ONLY source of facts');

    // Also verify POST /api/assistant passes the grounded system prompt to Groq.
    vi.stubEnv('GROQ_API_KEY', 'test-groq-key');
    vi.stubEnv('HINDSIGHT_ENABLED', 'false');
    mockRequireRole.mockResolvedValue({
      user: { id: 'owner-user' },
      profile: { role: 'owner', displayName: 'Kush', timezone: 'Asia/Kolkata' },
      admin: db,
    });
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('data: {"choices":[{"delta":{"content":"Zero failed this month."}}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const res = await assistantPost(
      new Request('http://localhost/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'How many orders failed this month and why?' }] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body ?? '{}')) as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemMsg = body.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(systemMsg).toContain('LIVE PLATFORM DATA');
    expect(systemMsg).toContain('Failed at supplier: 4');
    expect(systemMsg).toContain('Never invent');
  });

  it('strictly isolates reseller context to own tenant and never leaks other tenants or supplier details', async () => {
    const db = createSeededDb();
    const ctx = await buildRemyLiveContext(db, { role: 'reseller', tenantId: TENANT_A, timezone: 'Asia/Kolkata' }, NOW);

    expect(ctx.periods.allTime.totalOrders).toBe(2);
    expect(ctx.periods.allTime.deliveredOrders).toBe(1);
    expect(ctx.periods.allTime.failedOrders).toBe(1);
    expect(ctx.periods.thisMonth.failedOrders).toBe(0);
    expect(ctx.suppliers).toEqual([]);
    expect(ctx.resellers).toBeNull();
    expect(ctx.resellerStore?.storeName).toBe('Alpha Store');
    expect(ctx.resellerStore?.walletBalance).toBe('25.00 USDT');

    const prompt = buildRemySystemPrompt('reseller', ctx);
    expect(prompt).toContain('Alpha Store');
    expect(prompt).toContain('25.00 USDT');
    expect(prompt).toContain('14.00 USDT');
    // Must NEVER leak other tenants, their products, their wallets, or any supplier names/costs/errors.
    expect(prompt).not.toContain('Bravo Secret Store');
    expect(prompt).not.toContain('Secret Rival Product');
    expect(prompt).not.toContain('99.00 USDT');
    expect(prompt).not.toContain('ProdSeller');
    expect(prompt).not.toContain('Canboso');
    expect(prompt).not.toContain('0.36 USDT');
    expect(prompt).not.toContain('12.50 USDT');
    expect(prompt).not.toContain('8C668888');

    await expect(
      buildRemyLiveContext(db, { role: 'reseller', tenantId: null }, NOW),
    ).rejects.toThrow('Reseller account is not active');
  });
});

describe('Pre-launch fix 2: Bot Studio preview {store} uses store display name matching real bot', () => {
  it('resolves store display name (not @botusername) identically in Bot Studio and real Telegram bot context', async () => {
    const db = createMemoryDb({
      platform_settings: [
        {
          id: 'ps-1',
          platform_name: 'Black Tier Circle',
          owner_bot_username: 'blacktiercirclebot',
          owner_bot_status: 'connected',
          support_contact: '@btc_support',
          payment_demo_mode: false,
          bep20_enabled: true,
          bep20_wallet_address: '0x1111111111111111111111111111111111111111',
          bep20_confirmations: 15,
          topup_expiry_minutes: 30,
        },
      ],
      tenant_settings: [
        {
          id: 'ts-1',
          tenant_id: 'tenant-1',
          store_name: 'Nova Digital',
          store_status: 'open',
        },
      ],
      store_config: [],
    });

    const ownerStudioName = await resolveStudioStoreName(db, 'owner', null);
    const ownerBotCtx = await resolveBotContext(db, 'owner', null);
    expect(ownerStudioName).toBe('Black Tier Circle');
    expect(ownerBotCtx.storeName).toBe('Black Tier Circle');
    expect(ownerStudioName).not.toContain('@');
    expect(ownerStudioName).not.toContain('blacktiercirclebot');

    const welcomeRendered = renderTemplate(DEFAULT_STORE_CONFIG.welcome, {
      name: 'Asha',
      store: ownerStudioName,
      balance: '12.00 USDT',
      channel: '',
      group: '',
      website: '',
    });
    expect(welcomeRendered).toContain('Black Tier Circle is open.');
    expect(welcomeRendered).not.toContain('@blacktiercirclebot');

    const resellerStudioName = await resolveStudioStoreName(db, 'reseller', 'tenant-1');
    const resellerBotCtx = await resolveBotContext(db, 'bot-1', 'tenant-1');
    expect(resellerStudioName).toBe('Nova Digital');
    expect(resellerBotCtx.storeName).toBe('Nova Digital');

    // Real bot referral & freebie screens also fill {store} with the store display name.
    const refText = referralHomeText({
      template: 'Invite friends to {store}!',
      storeName: ownerBotCtx.storeName,
      link: 'https://t.me/blacktiercirclebot?start=ref_ABC123',
      invited: 0,
      pending: 0,
      qualified: 0,
      points: 0,
      walletMinor: 0n,
      nextLine: null,
    });
    expect(refText).toContain('Invite friends to Black Tier Circle!');
    expect(freebieListText('Freebies from {store}', [], ownerBotCtx.storeName)).toContain(
      'Freebies from Black Tier Circle',
    );

    const studioPageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'app/(platform)/bot-studio/page.tsx'),
      'utf8',
    );
    expect(studioPageSource).not.toContain('ownerBotDisplayName');
    expect(studioPageSource).toContain('store: resolvedStoreName');
  });
});

describe('Pre-launch fix 3: Marketing minimum qualifying order formatting and round-trip', () => {
  it('displays 0 for 0 or 1 minor unit and round-trips USDT values exactly via lib/money.ts', () => {
    expect(DEFAULT_REFERRAL_CONFIG.minQualifyingOrderMinor).toBe('0');

    expect(formatUsdtInput(0n, { treatDustAsZero: true })).toBe('0');
    expect(formatUsdtInput(1n, { treatDustAsZero: true })).toBe('0');
    expect(formatUsdtInput(200_000n)).toBe('0.2');
    expect(formatUsdtInput(2_500_000n, { treatDustAsZero: true })).toBe('2.5');
    expect(formatUsdtInput(10_000_000n, { treatDustAsZero: true })).toBe('10');

    // Legacy DB row with "1" minor unit displays as "0" (never "0.000001") and saves back as "0".
    const legacyDraft = referralDraftFrom({
      ...DEFAULT_REFERRAL_CONFIG,
      minQualifyingOrderMinor: '1',
    });
    expect(legacyDraft.minOrder).toBe('0');
    expect(usdtToMinor(legacyDraft.minOrder).toString()).toBe('0');

    // Exact round-trip for non-zero values.
    for (const input of ['0', '0.5', '2.5', '15.25', '100']) {
      const minor = usdtToMinor(input);
      const draft = referralDraftFrom({
        ...DEFAULT_REFERRAL_CONFIG,
        minQualifyingOrderMinor: minor.toString(),
      });
      expect(draft.minOrder).toBe(input);
      expect(usdtToMinor(draft.minOrder)).toBe(minor);
    }
  });
});

describe('Pre-launch fix 4: Supplier orders delivered history & Resubmit cost confirmation', () => {
  const DELIVERED_ORDER = '8c668888-1111-4111-8111-111111111111';
  const FAILED_ORDER = '9d779999-2222-4222-8222-222222222222';
  const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';

  function createSupplierOrdersDb() {
    return createMemoryDb({
      orders: [
        {
          id: DELIVERED_ORDER,
          tenant_id: null,
          bot_id: 'owner',
          customer_id: 'cust-1',
          product_id: PRODUCT_ID,
          channel: 'owner_store',
          quantity: 1,
          quoted_retail_price: '6000000',
          quoted_wholesale_price: '4000000',
          payment_status: 'verified',
          funding_status: 'not_applicable',
          fulfillment_status: 'ready',
          delivery_status: 'sent',
          created_at: '2026-11-13T10:00:00.000Z',
          updated_at: '2026-11-13T10:05:00.000Z',
        },
        {
          id: FAILED_ORDER,
          tenant_id: null,
          bot_id: 'owner',
          customer_id: 'cust-1',
          product_id: PRODUCT_ID,
          channel: 'owner_store',
          quantity: 2,
          quoted_retail_price: '12000000',
          quoted_wholesale_price: '8000000',
          payment_status: 'verified',
          funding_status: 'not_applicable',
          fulfillment_status: 'failed',
          delivery_status: 'not_ready',
          created_at: '2026-11-14T10:00:00.000Z',
          updated_at: '2026-11-14T10:01:00.000Z',
        },
      ],
      fulfillment_attempts: [
        {
          id: 'att-delivered-ok',
          order_id: DELIVERED_ORDER,
          attempt_number: 2,
          method: 'supplier',
          status: 'success',
          error: null,
          started_at: '2026-11-13T10:03:00.000Z',
          completed_at: '2026-11-13T10:04:00.000Z',
        },
        {
          id: 'att-delivered-old-fail',
          order_id: DELIVERED_ORDER,
          attempt_number: 1,
          method: 'supplier',
          status: 'failed',
          error: 'Temporary supplier timeout',
          started_at: '2026-11-13T10:01:00.000Z',
          completed_at: '2026-11-13T10:01:30.000Z',
        },
        {
          id: 'att-failed-latest',
          order_id: FAILED_ORDER,
          attempt_number: 1,
          method: 'supplier',
          status: 'failed',
          error: 'Supplier rejected SKU',
          started_at: '2026-11-14T10:00:10.000Z',
          completed_at: '2026-11-14T10:00:20.000Z',
        },
      ],
      products: [
        {
          id: PRODUCT_ID,
          title: 'HMA VPN 30D',
          supplier_id: 'sup-1',
          supplier_price_minor: '3500000',
        },
      ],
      suppliers: [
        {
          id: 'sup-1',
          name: 'ProdSeller',
          status: 'active',
          balance_usdt: 10,
          last_sync_at: '2026-11-21T00:00:00.000Z',
          last_sync_error: null,
        },
      ],
      supplier_balance_snapshots: [],
    });
  }

  it('marks attempts on already-delivered orders as history-only and computes exact supplier cost for resubmittable orders', async () => {
    const db = createSupplierOrdersDb();
    const desk = await readSupplierDesk(db);

    const oldFailOnDelivered = desk.orders.find((row) => row.attemptId === 'att-delivered-old-fail');
    expect(oldFailOnDelivered).toBeDefined();
    expect(oldFailOnDelivered?.orderDelivered).toBe(true);
    expect(oldFailOnDelivered?.status).toBe('delivered');
    expect(oldFailOnDelivered?.canComplete).toBe(false);
    expect(oldFailOnDelivered?.canFail).toBe(false);
    expect(oldFailOnDelivered?.canResubmit).toBe(false);
    expect(oldFailOnDelivered?.canReconcile).toBe(false);

    const activeFail = desk.orders.find((row) => row.attemptId === 'att-failed-latest');
    expect(activeFail).toBeDefined();
    expect(activeFail?.orderDelivered).toBe(false);
    expect(activeFail?.canResubmit).toBe(true);
    expect(activeFail?.canFail).toBe(false);
    expect(activeFail?.canComplete).toBe(false);
    expect(activeFail?.supplierCostMinor).toBe('7000000');
    expect(formatUsdt(BigInt(activeFail?.supplierCostMinor ?? '0'))).toBe('7.00 USDT');

    // Backend refuses resubmit, manual fail, and manual complete on delivered orders.
    await expect(resubmitSupplierOrder(db, DELIVERED_ORDER, 'owner-1')).rejects.toThrow('already delivered');
    await expect(markSupplierManuallyFailed(db, DELIVERED_ORDER, 'owner-1', 'nope')).rejects.toThrow('already delivered');
    await expect(markSupplierManuallyCompleted(db, DELIVERED_ORDER, 'owner-1', 'KEY-123')).rejects.toThrow('already delivered');

    // UI renders History only on delivered orders and requires a confirmation modal showing Supplier cost for Resubmit.
    const suppliersUi = fs.readFileSync(
      path.resolve(process.cwd(), 'app/(platform)/catalog/suppliers.tsx'),
      'utf8',
    );
    expect(suppliersUi).toContain('History only');
    expect(suppliersUi).toContain('Confirm supplier resubmit');
    expect(suppliersUi).toContain('Supplier cost');
    expect(suppliersUi).toContain('Confirm resubmit');
    expect(suppliersUi).toContain('setPendingResubmit(row)');
  });
});
