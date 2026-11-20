/**
 * @file tests/unit/phase-k.test.ts
 *
 * Phase K test suite covering:
 * 1. Walkthrough #23: Launch checklist marks "Payment mode: Demo" as passing: false (Needs attention)
 *    and "Payment mode: Live" as passing: true
 * 2. Walkthrough #16: syncSupplierProducts refreshes last_synced_at on already-out-of-stock unseen SKUs,
 *    records balance snapshots when getBalance is supported, and POST /api/supplier/sync handles
 *    empty JSON bodies from external cron callers without throwing 400
 * 3. readSystemHealth: computes supplier trends, last/next sync & cron run windows, respects single
 *    delivered-order truth in jobQueue / failedJobs, formats error log in plain English
 * 4. /api/platform/system-health owner-only RBAC guard (reseller returns 403)
 *
 * @module Tests
 */

import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { encrypt } from '@/lib/encryption';
import { AuthError } from '@/lib/errors';
import { resetRateLimitStore } from '@/lib/rate-limiter';
import { evaluateLaunchChecklist } from '@/modules/launch';
import { readSystemHealth } from '@/modules/platform/system-health';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const {
  mockRequireOwner,
  mockCreateProdSellerClient,
  mockListProducts,
  mockGetBalance,
  mockAuthorizeCronOrOwner,
  mockAdminDbRef,
} = vi.hoisted(() => {
  const mockListProducts = vi.fn();
  const mockGetBalance = vi.fn();
  return {
    mockRequireOwner: vi.fn(),
    mockCreateProdSellerClient: vi.fn(() => ({
      listProducts: mockListProducts,
      getBalance: mockGetBalance,
    })),
    mockListProducts,
    mockGetBalance,
    mockAuthorizeCronOrOwner: vi.fn(async () => null),
    mockAdminDbRef: { current: null as unknown },
  };
});

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual,
    requireOwner: mockRequireOwner,
  };
});

vi.mock('@/lib/cron-auth', () => ({
  authorizeCronOrOwner: mockAuthorizeCronOrOwner,
}));

vi.mock('@/integrations/prodseller/client', () => ({
  createProdSellerClient: mockCreateProdSellerClient,
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

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => mockAdminDbRef.current,
}));

import { GET as systemHealthGet, POST as systemHealthPost } from '@/app/api/platform/system-health/route';
import { POST as supplierSyncPost } from '@/app/api/supplier/sync/route';
import { syncSupplierProducts } from '@/modules/supplier';

const PREVIOUS_KEY = process.env.BOT_TOKEN_ENCRYPTION_KEY;

beforeAll(() => {
  process.env.BOT_TOKEN_ENCRYPTION_KEY = 'cd'.repeat(32);
});

afterAll(() => {
  if (PREVIOUS_KEY === undefined) {
    delete process.env.BOT_TOKEN_ENCRYPTION_KEY;
  } else {
    process.env.BOT_TOKEN_ENCRYPTION_KEY = PREVIOUS_KEY;
  }
});

afterEach(() => {
  resetRateLimitStore();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  mockRequireOwner.mockReset();
  mockListProducts.mockReset();
  mockGetBalance.mockReset();
  mockCreateProdSellerClient.mockClear();
  mockAuthorizeCronOrOwner.mockReset();
  mockAuthorizeCronOrOwner.mockResolvedValue(null);
  mockAdminDbRef.current = null;
});

describe('Phase K — Walkthrough #23 launch checklist payment mode', () => {
  it('marks Payment mode: Demo as failing and Payment mode: Live as passing', async () => {
    const demoDb = createMemoryDb({
      platform_settings: [
        {
          id: 'ps-1',
          platform_name: 'Black Tier Circle',
          owner_bot_status: 'disconnected',
          bep20_enabled: false,
          binance_pay_enabled: false,
          platform_usdt_wallet_bep20: null,
        },
      ],
    });
    vi.stubEnv('PAYMENT_SANDBOX', 'true');

    const demoItems = await evaluateLaunchChecklist(demoDb);
    const demoPay = demoItems.find((item) => item.id === 'pay_mode');
    expect(demoPay).toBeDefined();
    expect(demoPay?.label).toBe('Payment mode: Demo');
    expect(demoPay?.passing).toBe(false);

    vi.stubEnv('PAYMENT_SANDBOX', 'false');
    const liveDb = createMemoryDb({
      platform_settings: [
        {
          id: 'ps-1',
          platform_name: 'Black Tier Circle',
          owner_bot_status: 'connected',
          bep20_enabled: true,
          binance_pay_enabled: false,
          platform_usdt_wallet_bep20: '0x1111111111111111111111111111111111111111',
        },
      ],
    });
    vi.stubEnv('PAYMENT_PROVIDER_MODE', 'live');
    vi.stubEnv('BSCSCAN_API_KEY', 'live-bscscan-key');

    const liveItems = await evaluateLaunchChecklist(liveDb);
    const livePay = liveItems.find((item) => item.id === 'pay_mode');
    expect(livePay).toBeDefined();
    expect(livePay?.label).toBe('Payment mode: Live');
    expect(livePay?.passing).toBe(true);
  });
});

describe('Phase K — Walkthrough #16 supplier sync timestamps, snapshots & empty cron body', () => {
  it('refreshes last_synced_at on already out-of-stock unseen SKUs and records balance snapshot', async () => {
    const oldTs = '2026-09-01T00:00:00.000Z';
    const db = createMemoryDb({
      suppliers: [
        {
          id: 'sup-1',
          name: 'ProdSeller',
          slug: 'prodseller',
          base_url: 'https://prodseller.com/v1',
          api_key_encrypted: encrypt('psk_test_key'),
          auth_header_name: 'X-API-Key',
          adapter_name: 'prodseller',
          status: 'active',
          balance_usdt: 10,
          last_sync_at: oldTs,
          last_sync_error: null,
          product_count: 1,
        },
      ],
      supplier_products: [
        {
          id: 'sp-active',
          supplier_id: 'sup-1',
          supplier_sku: 'sku-live',
          name: 'Live SKU',
          in_stock: true,
          supplier_price: 2,
          review_status: 'published',
          product_id: null,
          last_synced_at: oldTs,
        },
        {
          id: 'sp-old-oos',
          supplier_id: 'sup-1',
          supplier_sku: 'sku-missing-from-feed',
          name: 'Old OOS SKU',
          in_stock: false,
          supplier_price: 3,
          review_status: 'pending_review',
          product_id: null,
          last_synced_at: oldTs,
        },
      ],
    });

    mockListProducts.mockResolvedValue([
      {
        id: 'sku-live',
        name: 'Live SKU',
        description: 'Plan',
        price: 2,
        publicPrice: 4,
        imageUrl: null,
        delivery: { type: 'instant' },
        sold: 5,
        inStock: true,
        requiresEmailActivation: false,
      },
    ]);
    mockGetBalance.mockResolvedValue({
      telegramId: 1,
      username: 'owner',
      balance: 42.75,
      membership: 'vip',
    });

    const summary = await syncSupplierProducts(db, 'sup-1');
    expect(summary.synced).toBe(1);
    expect(summary.outOfStock).toBe(0);

    const oosRow = db.tables.supplier_products?.find((row) => row.id === 'sp-old-oos');
    expect(oosRow?.in_stock).toBe(false);
    expect(oosRow?.last_synced_at).not.toBe(oldTs);

    const snapshots = db.tables.supplier_balance_snapshots ?? [];
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.balance_usdt).toBe(42.75);
    expect(db.tables.suppliers?.[0]?.balance_usdt).toBe(42.75);
  });

  it('POST /api/supplier/sync succeeds with Content-Type: application/json and empty body', async () => {
    const db = createMemoryDb({
      suppliers: [
        {
          id: 'sup-1',
          name: 'ProdSeller',
          slug: 'prodseller',
          base_url: 'https://prodseller.com/v1',
          api_key_encrypted: encrypt('psk_test_key'),
          auth_header_name: 'X-API-Key',
          adapter_name: 'prodseller',
          status: 'active',
          balance_usdt: 25,
          last_sync_at: '2026-10-01T00:00:00.000Z',
          last_sync_error: null,
          product_count: 1,
        },
      ],
      supplier_products: [],
    });
    mockAdminDbRef.current = db;
    mockListProducts.mockResolvedValue([
      {
        id: 'sku-1',
        name: 'Plan A',
        description: 'Desc',
        price: 2,
        publicPrice: 5,
        imageUrl: null,
        delivery: { type: 'instant' },
        sold: 1,
        inStock: true,
        requiresEmailActivation: false,
      },
    ]);
    mockGetBalance.mockResolvedValue({
      telegramId: 1,
      username: 'owner',
      balance: 25,
      membership: 'std',
    });

    const req = new NextRequest('http://localhost/api/supplier/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '',
    });
    const res = await supplierSyncPost(req);
    const json = (await res.json()) as {
      readonly success: boolean;
      readonly data: { readonly results: ReadonlyArray<{ readonly ok: boolean }> };
    };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.results).toHaveLength(1);
    expect(json.data.results[0]?.ok).toBe(true);
    expect((db.tables.audit_log ?? []).some((row) => row.action === 'cron.supplier_sync')).toBe(true);
  });
});

describe('Phase K — readSystemHealth & API route RBAC', () => {
  it('computes cron windows, supplier balance trends, clean error log, and single order-state truth', async () => {
    const now = new Date('2026-10-10T12:00:00.000Z');
    const db = createMemoryDb({
      platform_settings: [
        {
          id: 'ps-1',
          platform_name: 'Black Tier Circle',
          owner_bot_status: 'connected',
          owner_bot_username: 'blacktiercirclebot',
          owner_bot_token_encrypted: encrypt('12345:AAABBBCCC'),
          owner_bot_last_health_at: '2026-10-10T11:50:00.000Z',
          bep20_enabled: true,
          platform_usdt_wallet_bep20: '0x1111111111111111111111111111111111111111',
        },
      ],
      tenants: [
        { id: 'ten-1', business_name: 'Prince Store', display_name: 'Prince', status: 'active' },
      ],
      bot_connections: [
        {
          id: 'bot-1',
          tenant_id: 'ten-1',
          username: 'prince_bot',
          status: 'connected',
          webhook_secret: 'sec',
          last_health_at: '2026-10-10T11:52:00.000Z',
          updated_at: '2026-10-10T11:52:00.000Z',
        },
      ],
      suppliers: [
        {
          id: 'sup-1',
          name: 'ProdSeller',
          status: 'active',
          balance_usdt: 50.25,
          last_sync_at: '2026-10-10T11:55:00.000Z',
          last_sync_error: null,
          product_count: 10,
        },
      ],
      supplier_balance_snapshots: [
        { id: 's-1', supplier_id: 'sup-1', balance_usdt: 40.0, checked_at: '2026-10-09T12:00:00.000Z' },
        { id: 's-2', supplier_id: 'sup-1', balance_usdt: 50.25, checked_at: '2026-10-10T11:55:00.000Z' },
      ],
      supplier_products: [
        { id: 'sp-1', supplier_id: 'sup-1', in_stock: true },
        { id: 'sp-2', supplier_id: 'sup-1', in_stock: false },
      ],
      products: [
        {
          id: 'prod-1',
          sku: 'SKU-1',
          title: 'Gemini 18M',
          description: 'Plan',
          category: 'ai',
          delivery_type: 'manual',
          status: 'published',
          wholesale_price: '2000000',
          retail_price: '5000000',
          stock_unlimited: true,
          stock_count: null,
          reseller_eligible: true,
          max_purchase_qty: 5,
          version: 1,
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-01T00:00:00.000Z',
        },
      ],
      orders: [
        {
          id: '8c668888-0000-4000-8000-000000000001',
          tenant_id: 'ten-1',
          product_id: 'prod-1',
          payment_status: 'verified',
          fulfillment_status: 'failed',
          delivery_status: 'sent',
          quoted_retail_price: '600000',
          quantity: 1,
          created_at: '2026-10-10T10:00:00.000Z',
          updated_at: '2026-10-10T10:05:00.000Z',
        },
        {
          id: 'ff001122-0000-4000-8000-000000000002',
          tenant_id: null,
          product_id: 'prod-1',
          payment_status: 'verified',
          fulfillment_status: 'failed',
          delivery_status: 'not_ready',
          quoted_retail_price: '800000',
          quantity: 1,
          created_at: '2026-10-10T11:30:00.000Z',
          updated_at: '2026-10-10T11:32:00.000Z',
        },
        {
          id: 'aa998877-0000-4000-8000-000000000003',
          tenant_id: null,
          product_id: 'prod-1',
          payment_status: 'verified',
          fulfillment_status: 'supplier_pending',
          delivery_status: 'queued',
          quoted_retail_price: '500000',
          quantity: 2,
          created_at: '2026-10-10T11:55:00.000Z',
          updated_at: '2026-10-10T11:56:00.000Z',
        },
      ],
      fulfillment_attempts: [
        {
          id: 'att-1',
          order_id: 'ff001122-0000-4000-8000-000000000002',
          method: 'supplier',
          status: 'failed',
          error: 'OUT_OF_STOCK',
          started_at: '2026-10-10T11:31:00.000Z',
          completed_at: '2026-10-10T11:32:00.000Z',
        },
      ],
      audit_log: [
        {
          id: 'log-1',
          action: 'cron.supplier_sync',
          reason: 'Supplier catalog sync',
          after_val: { suppliers: 1, ok: 1, failed: 0, supplierName: 'ProdSeller', durationMs: 1200 },
          created_at: '2026-10-10T11:55:00.000Z',
        },
        {
          id: 'log-2',
          action: 'fraud.freebie_refused',
          reason: 'Daily freebie limit exceeded at 2026-10-10',
          created_at: '2026-10-10T11:20:00.000Z',
        },
      ],
    });
    vi.stubEnv('PAYMENT_SANDBOX', 'true');

    const payload = await readSystemHealth(db, now);

    // Supplier sync timing & trend (10 min cadence for 1 active supplier)
    expect(payload.suppliers).toHaveLength(1);
    expect(payload.suppliers[0]?.balanceTrend).toEqual([40, 50.25]);
    expect(payload.suppliers[0]?.lastSyncAt).toBe('2026-10-10T11:55:00.000Z');
    expect(payload.suppliers[0]?.nextSyncAt).toBe('2026-10-10T12:05:00.000Z');
    expect(payload.suppliers[0]?.statusLabel).toBe('Healthy');

    // Crons
    const syncCron = payload.crons.find((c) => c.id === 'supplier_sync');
    expect(syncCron?.lastRunAt).toBe('2026-10-10T11:55:00.000Z');
    expect(syncCron?.nextRunAt).toBe('2026-10-10T12:05:00.000Z');
    expect(syncCron?.overdue).toBe(false);

    // Delivered order 8C668888 is never in failedJobs or jobQueue
    expect(payload.failedJobs.some((j) => j.id.includes('8c668888'))).toBe(false);
    expect(payload.jobQueue.some((j) => j.id.includes('8c668888'))).toBe(false);

    // Real failed order FF001122 appears with plain-English note
    expect(payload.failedJobs).toHaveLength(1);
    expect(payload.failedJobs[0]?.target).toContain('FF001122');
    expect(payload.failedJobs[0]?.reason).toBe('Product is out of stock');

    // In-flight order AA998877 appears in jobQueue
    expect(payload.jobQueue).toHaveLength(1);
    expect(payload.jobQueue[0]?.target).toContain('AA998877');

    // Error log sanitizes ISO dates and snake_case
    const securityErr = payload.errorLog.find((e) => e.category === 'Security');
    expect(securityErr?.title).toBe('Freebie daily limit hit');
    expect(securityErr?.message).not.toMatch(/\d{4}-\d{2}-\d{2}/);

    // Bots
    expect(payload.summary.botsHealthy).toBe('2/2');
  });

  it('rejects reseller requests on GET & POST /api/platform/system-health with 403', async () => {
    mockRequireOwner.mockRejectedValue(new AuthError('FORBIDDEN', 'Owner access required', 403));

    const getRes = await systemHealthGet();
    expect(getRes.status).toBe(403);

    const postRes = await systemHealthPost(
      new Request('http://localhost/api/platform/system-health', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ job: 'supplier_sync' }),
      }),
    );
    expect(postRes.status).toBe(403);
  });
});
