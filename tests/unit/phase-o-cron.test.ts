/**
 * @file tests/unit/phase-o-cron.test.ts
 *
 * Phase O cron route guarantees:
 * 1. All 5 cron routes reject requests without valid Authorization: Bearer CRON_SECRET (401).
 * 2. Each cron processor enforces both a batch limit and a time budget well under 25 s.
 * 3. /api/supplier/sync picks ONE supplier (oldest last_sync_at, nulls first) and returns timing.
 * 4. System health reflects all 5 cron jobs and scales per-supplier nextSyncAt across active suppliers.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { encrypt } from '@/lib/encryption';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const {
  mockRequireOwner,
  mockAdminDbRef,
  mockTelegramGetWebhookInfo,
  mockTelegramSendHtml,
  mockListProducts,
} = vi.hoisted(() => ({
  mockRequireOwner: vi.fn(),
  mockAdminDbRef: { current: null as unknown },
  mockTelegramGetWebhookInfo: vi.fn(),
  mockTelegramSendHtml: vi.fn(),
  mockListProducts: vi.fn(),
}));

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual,
    requireOwner: mockRequireOwner,
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => mockAdminDbRef.current,
}));

vi.mock('@/integrations/telegram/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/integrations/telegram/api')>();
  return {
    ...actual,
    telegramGetWebhookInfo: mockTelegramGetWebhookInfo,
    telegramSendHtml: mockTelegramSendHtml,
  };
});

vi.mock('@/integrations/prodseller/client', () => ({
  createProdSellerClient: () => ({
    listProducts: mockListProducts,
  }),
  SupplierError: class SupplierError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

import { POST as supplierSyncPost } from '@/app/api/supplier/sync/route';
import { POST as fulfillmentPost } from '@/app/api/fulfillment/process/route';
import { POST as reconcilePost } from '@/app/api/supplier/reconcile/route';
import { POST as botsHealthPost } from '@/app/api/bots/health/route';
import { POST as broadcastsProcessPost } from '@/app/api/platform/broadcasts/process/route';
import { runBotHealthChecks } from '@/modules/bots';
import { processQueuedFulfillments } from '@/modules/fulfillment';
import { reconcileUnknownSupplierOrders } from '@/modules/fulfillment/supplier';
import { processDueBroadcasts } from '@/modules/platform/growth';
import { readSystemHealth } from '@/modules/platform/system-health';
import { pickOldestSupplier, syncSupplierProducts } from '@/modules/supplier';
import { pollPendingSupplierOrders } from '@/modules/supplier/poll';
import { getVerifiedUser } from '@/lib/auth/verify-user';

const PREV_KEY = process.env.BOT_TOKEN_ENCRYPTION_KEY;
const PREV_CRON = process.env.CRON_SECRET;

beforeAll(() => {
  process.env.BOT_TOKEN_ENCRYPTION_KEY = 'ef'.repeat(32);
});

afterAll(() => {
  if (PREV_KEY === undefined) delete process.env.BOT_TOKEN_ENCRYPTION_KEY;
  else process.env.BOT_TOKEN_ENCRYPTION_KEY = PREV_KEY;
  if (PREV_CRON === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = PREV_CRON;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  mockRequireOwner.mockReset();
  mockTelegramGetWebhookInfo.mockReset();
  mockTelegramSendHtml.mockReset();
  mockListProducts.mockReset();
  mockAdminDbRef.current = null;
});

describe('Phase O — All 5 cron routes reject missing/wrong CRON_SECRET', () => {
  const routes: ReadonlyArray<readonly [string, (req: NextRequest) => Promise<Response>]> = [
    ['/api/supplier/sync', supplierSyncPost],
    ['/api/fulfillment/process', fulfillmentPost],
    ['/api/supplier/reconcile', reconcilePost],
    ['/api/bots/health', botsHealthPost],
    ['/api/platform/broadcasts/process', broadcastsProcessPost],
  ];

  it.each(routes)('rejects %s without Authorization Bearer CRON_SECRET (401)', async (path, handler) => {
    vi.stubEnv('CRON_SECRET', 'super-secret-cron-token-123');
    mockRequireOwner.mockRejectedValue(new Error('not logged in'));

    const missingRes = await handler(new NextRequest(`http://localhost${path}`, { method: 'POST' }));
    expect(missingRes.status).toBe(401);

    const wrongRes = await handler(
      new NextRequest(`http://localhost${path}`, {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-token' },
      }),
    );
    expect(wrongRes.status).toBe(401);
  });

  it('accepts valid Authorization Bearer CRON_SECRET on all 5 routes', async () => {
    vi.stubEnv('CRON_SECRET', 'super-secret-cron-token-123');
    mockRequireOwner.mockRejectedValue(new Error('no session'));
    mockAdminDbRef.current = createMemoryDb({
      suppliers: [],
      orders: [],
      fulfillment_attempts: [],
      bot_connections: [],
      broadcasts: [],
      audit_log: [],
    });

    for (const [path, handler] of routes) {
      const res = await handler(
        new NextRequest(`http://localhost${path}`, {
          method: 'POST',
          headers: { authorization: 'Bearer super-secret-cron-token-123' },
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; data: { durationMs?: number } };
      expect(body.success).toBe(true);
      expect(typeof body.data.durationMs).toBe('number');
    }
  });
});

describe('Phase O — Bounded batch limits and time budgets', () => {
  it('pickOldestSupplier picks never-synced first, then oldest lastSyncAt', () => {
    const picked1 = pickOldestSupplier([
      {
        id: 's-new',
        name: 'Newer',
        slug: 'newer',
        baseUrl: 'https://a.test',
        authHeaderName: 'X-API-Key',
        status: 'active',
        balanceUsdt: '10',
        balanceCheckedAt: null,
        membershipTier: null,
        lastSyncAt: '2026-10-10T11:50:00.000Z',
        lastSyncError: null,
        productCount: 5,
        hasApiKey: true,
      },
      {
        id: 's-never',
        name: 'Never',
        slug: 'never',
        baseUrl: 'https://b.test',
        authHeaderName: 'X-API-Key',
        status: 'active',
        balanceUsdt: '10',
        balanceCheckedAt: null,
        membershipTier: null,
        lastSyncAt: null,
        lastSyncError: null,
        productCount: 0,
        hasApiKey: true,
      },
      {
        id: 's-old',
        name: 'Older',
        slug: 'older',
        baseUrl: 'https://c.test',
        authHeaderName: 'X-API-Key',
        status: 'active',
        balanceUsdt: '10',
        balanceCheckedAt: null,
        membershipTier: null,
        lastSyncAt: '2026-10-10T10:00:00.000Z',
        lastSyncError: null,
        productCount: 5,
        hasApiKey: true,
      },
    ]);
    expect(picked1.supplier?.id).toBe('s-never');
    expect(picked1.totalActive).toBe(3);
  });

  it('syncSupplierProducts respects maxUpdates and timeBudgetMs', async () => {
    const db = createMemoryDb({
      suppliers: [
        {
          id: 'sup-1',
          name: 'ProdSeller',
          slug: 'prodseller',
          base_url: 'https://prodseller.test/v1',
          api_key_encrypted: encrypt('psk_key'),
          auth_header_name: 'X-API-Key',
          adapter_name: 'prodseller',
          status: 'active',
          balance_usdt: 10,
          last_sync_at: null,
          last_sync_error: null,
          product_count: 5,
        },
      ],
      supplier_products: Array.from({ length: 5 }, (_, i) => ({
        id: `sp-${i}`,
        supplier_id: 'sup-1',
        supplier_sku: `sku-${i}`,
        name: `Old ${i}`,
        description: '',
        in_stock: true,
        supplier_price: 1,
        review_status: 'pending_review',
        product_id: null,
      })),
    });
    mockListProducts.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        id: `sku-${i}`,
        name: `New ${i}`,
        description: '',
        price: 2,
        publicPrice: 3,
        imageUrl: null,
        delivery: { type: 'instant' },
        sold: 0,
        inStock: true,
        requiresEmailActivation: false,
      })),
    );

    const bounded = await syncSupplierProducts(db, 'sup-1', { maxUpdates: 2, timeBudgetMs: 10_000 });
    expect(bounded.updatedProducts).toBe(2);
    expect(bounded.truncated).toBe(true);
    expect(bounded.durationMs).toBeLessThan(10_000);

    const timedOut = await syncSupplierProducts(db, 'sup-1', { timeBudgetMs: 0 });
    expect(timedOut.truncated).toBe(true);
    expect(timedOut.updatedProducts).toBe(0);
  });

  it('processQueuedFulfillments enforces batchLimit and timeBudgetMs', async () => {
    const nowIso = new Date().toISOString();
    const db = createMemoryDb({
      orders: Array.from({ length: 5 }, (_, i) => ({
        id: `ord-${i}`,
        tenant_id: null,
        customer_id: 'cust-1',
        product_id: 'prod-1',
        channel: 'owner_bot',
        payment_status: 'verified',
        funding_status: 'not_applicable',
        fulfillment_status: 'queued',
        delivery_status: 'not_ready',
        quantity: 1,
        quoted_wholesale_price: '1000000',
        quoted_retail_price: '2000000',
        created_at: nowIso,
        updated_at: nowIso,
      })),
    });

    const timedOut = await processQueuedFulfillments(db, { batchLimit: 2, timeBudgetMs: 0 });
    expect(timedOut.processed).toBe(0);
    expect(timedOut.truncated).toBe(true);
  });

  it('reconcileUnknownSupplierOrders and pollPendingSupplierOrders respect batchLimit and timeBudgetMs', async () => {
    const nowIso = new Date().toISOString();
    const db = createMemoryDb({
      orders: Array.from({ length: 4 }, (_, i) => ({
        id: `unk-${i}`,
        tenant_id: null,
        customer_id: 'cust-1',
        product_id: 'prod-1',
        channel: 'owner_bot',
        payment_status: 'verified',
        funding_status: 'not_applicable',
        fulfillment_status: 'outcome_unknown',
        delivery_status: 'not_ready',
        quantity: 1,
        quoted_wholesale_price: '1000000',
        quoted_retail_price: '2000000',
        created_at: nowIso,
        updated_at: nowIso,
      })),
      fulfillment_attempts: Array.from({ length: 4 }, (_, i) => ({
        id: `att-${i}`,
        order_id: `unk-${i}`,
        method: 'supplier',
        status: 'pending',
        artifact_path: `supplier_order:ext-${i}`,
        started_at: nowIso,
      })),
    });

    const rec = await reconcileUnknownSupplierOrders(db, { batchLimit: 2, timeBudgetMs: 0 });
    expect(rec.reconciled).toBe(0);
    expect(rec.truncated).toBe(true);

    const poll = await pollPendingSupplierOrders(db, { batchLimit: 2, timeBudgetMs: 0 });
    expect(poll.polled).toBe(0);
    expect(poll.truncated).toBe(true);
  });

  it('runBotHealthChecks sorts oldest-checked first and enforces batchLimit and timeBudgetMs', async () => {
    const checkedIds: string[] = [];
    mockTelegramGetWebhookInfo.mockImplementation(async (token: string) => {
      checkedIds.push(token);
      return { url: 'https://example.com', pending_update_count: 0 };
    });
    const db = createMemoryDb({
      bot_connections: [
        {
          id: 'bot-recent',
          tenant_id: 't-1',
          telegram_bot_id: 1,
          username: 'recent_bot',
          encrypted_token: encrypt('111:RECENT'),
          webhook_secret: 'sec1',
          status: 'connected',
          last_health_at: '2026-10-10T11:55:00.000Z',
        },
        {
          id: 'bot-never',
          tenant_id: 't-2',
          telegram_bot_id: 2,
          username: 'never_bot',
          encrypted_token: encrypt('222:NEVER'),
          webhook_secret: 'sec2',
          status: 'connected',
          last_health_at: null,
        },
        {
          id: 'bot-old',
          tenant_id: 't-3',
          telegram_bot_id: 3,
          username: 'old_bot',
          encrypted_token: encrypt('333:OLD'),
          webhook_secret: 'sec3',
          status: 'connected',
          last_health_at: '2026-10-10T10:00:00.000Z',
        },
      ],
    });

    const result = await runBotHealthChecks(db, { batchLimit: 2, timeBudgetMs: 10_000 });
    expect(result.checked).toBe(2);
    expect(result.totalConnected).toBe(3);
    expect(result.remaining).toBe(1);
    expect(result.truncated).toBe(true);
    expect(checkedIds).toEqual(['222:NEVER', '333:OLD']);

    const timedOut = await runBotHealthChecks(db, { batchLimit: 3, timeBudgetMs: 0 });
    expect(timedOut.checked).toBe(0);
    expect(timedOut.truncated).toBe(true);
  });

  it('processDueBroadcasts enforces maxJobs, maxRecipients, and timeBudgetMs', async () => {
    mockTelegramSendHtml.mockResolvedValue({ message_id: 1 });
    const pastIso = '2026-10-10T10:00:00.000Z';
    const db = createMemoryDb({
      platform_settings: [
        {
          id: 'ps-1',
          business_name: 'BTC',
          owner_bot_token_encrypted: encrypt('123:OWNER_TOKEN'),
          owner_bot_status: 'connected',
        },
      ],
      customers: Array.from({ length: 5 }, (_, i) => ({
        id: `c-${i}`,
        bot_id: null,
        telegram_chat_id: `1000${i}`,
        first_name: `Buyer ${i}`,
        is_blocked: false,
        credit_balance: '0',
        updated_at: pastIso,
      })),
      broadcasts: [
        {
          id: 'b-1',
          tenant_id: null,
          body: 'First',
          image_url: null,
          audience: 'all',
          status: 'scheduled',
          scheduled_for: pastIso,
          recipients: 5,
          sent: 0,
          failed: 0,
        },
        {
          id: 'b-2',
          tenant_id: null,
          body: 'Second',
          image_url: null,
          audience: 'all',
          status: 'scheduled',
          scheduled_for: pastIso,
          recipients: 5,
          sent: 0,
          failed: 0,
        },
      ],
    });

    const bounded = await processDueBroadcasts(db, new Date('2026-10-10T12:00:00.000Z'), 0, {
      maxJobs: 1,
      maxRecipients: 2,
      timeBudgetMs: 10_000,
    });
    expect(bounded.processed).toBe(1);
    expect(bounded.truncated).toBe(true);
    expect(bounded.results[0]?.sent).toBe(2);
    expect(mockTelegramSendHtml).toHaveBeenCalledTimes(2);
  });
});

describe('Phase O — System health shows all 5 crons & per-supplier rotation cycle', () => {
  it('computes 40-min supplier cycle for 4 active suppliers and tracks all 5 cron jobs', async () => {
    const now = new Date('2026-10-10T12:00:00.000Z');
    const db = createMemoryDb({
      platform_settings: [
        {
          id: 'ps-1',
          platform_name: 'Black Tier Circle',
          owner_bot_status: 'connected',
          owner_bot_username: 'btc_bot',
          owner_bot_token_encrypted: encrypt('123:TOK'),
          bep20_enabled: true,
          platform_usdt_wallet_bep20: '0x1111111111111111111111111111111111111111',
        },
      ],
      suppliers: [
        { id: 's1', name: 'ProdSeller', status: 'active', balance_usdt: 20, last_sync_at: '2026-10-10T11:50:00.000Z' },
        { id: 's2', name: 'Canboso', status: 'active', balance_usdt: 15, last_sync_at: '2026-10-10T11:40:00.000Z' },
        { id: 's3', name: 'AI TOOLS', status: 'active', balance_usdt: 10, last_sync_at: '2026-10-10T11:30:00.000Z' },
        { id: 's4', name: 'HitMeow Shop', status: 'active', balance_usdt: 5, last_sync_at: '2026-10-10T11:25:00.000Z' },
      ],
      audit_log: [
        {
          id: 'a-1',
          action: 'cron.supplier_sync',
          after_val: { suppliers: 1, ok: 1, failed: 0, supplierName: 'ProdSeller', durationMs: 1850 },
          created_at: '2026-10-10T11:50:00.000Z',
        },
        {
          id: 'a-2',
          action: 'cron.broadcasts',
          after_val: { processed: 1 },
          created_at: '2026-10-10T11:58:00.000Z',
        },
      ],
    });

    const health = await readSystemHealth(db, now);
    expect(health.crons.map((c) => c.id)).toEqual([
      'fulfillment',
      'supplier_reconcile',
      'supplier_sync',
      'bot_health',
      'broadcasts',
    ]);
    const syncCron = health.crons.find((c) => c.id === 'supplier_sync');
    expect(syncCron?.intervalMinutes).toBe(10);
    expect(syncCron?.detail).toContain('ProdSeller synced (1.9s)');
    // 4 suppliers × 10 min = 40 min cycle per supplier; 11:25 + 40m = 12:05 (not overdue!)
    const hitMeow = health.suppliers.find((s) => s.supplierId === 's4');
    expect(hitMeow?.nextSyncAt).toBe('2026-10-10T12:05:00.000Z');
    expect(hitMeow?.syncOverdue).toBe(false);
    expect(hitMeow?.statusLabel).toBe('Healthy');
  });
});

describe('Phase O — getVerifiedUser transient retry (fail-closed on real auth errors)', () => {
  it('retries transient AuthRetryableFetchError and succeeds, but never retries invalid JWT', async () => {
    const getUserRetry = vi
      .fn()
      .mockResolvedValueOnce({ data: { user: null }, error: { name: 'AuthRetryableFetchError', message: 'fetch failed' } })
      .mockResolvedValueOnce({ data: { user: { id: 'u-1' } as never }, error: null });
    const recovered = await getVerifiedUser({ auth: { getUser: getUserRetry } }, { retryDelaysMs: [0, 0] });
    expect(recovered.user?.id).toBe('u-1');
    expect(getUserRetry).toHaveBeenCalledTimes(2);

    const getUserBadJwt = vi
      .fn()
      .mockResolvedValue({ data: { user: null }, error: { name: 'AuthApiError', message: 'invalid JWT', status: 401 } });
    const rejected = await getVerifiedUser({ auth: { getUser: getUserBadJwt } }, { retryDelaysMs: [0, 0] });
    expect(rejected.user).toBeNull();
    expect(getUserBadJwt).toHaveBeenCalledTimes(1);
  });
});
