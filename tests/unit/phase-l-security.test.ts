import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { verifyTelegramSecret } from '@/integrations/telegram/webhook';
import { limitTelegramUpdate } from '@/lib/api-rate-limit';
import { constantTimeSecretMatch, verifyCronAuth } from '@/lib/cron-auth';
import { AppError } from '@/lib/errors';
import { readProfileGate } from '@/middleware';
import { readAnalytics } from '@/modules/platform/analytics';
import { parseCatalogFilters, readCatalog } from '@/modules/platform/catalog';
import { readAudienceCounts } from '@/modules/platform/growth';
import { parseOrderFilters, readOrders } from '@/modules/platform/orders';
import { readOverview } from '@/modules/platform/overview';
import { listStoresWithOverrides } from '@/modules/platform/settings-extra';
import { layoutHomeButtons } from '@/modules/store-config/keyboard';
import { sanitizeBotHtml } from '@/modules/store-config/sanitize';
import { DEFAULT_STORE_CONFIG } from '@/modules/store-config/defaults';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';
import type { DbClient } from '@/lib/supabase/query';

const mockConsumeRateLimit = vi.fn();

vi.mock('@/lib/rate-limiter', () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  mockConsumeRateLimit.mockReset();
});

describe('Phase L — middleware fail-closed profile gate', () => {
  it('denies access (redirects to /login) when profile is missing, errors, or lacks role/status', async () => {
    const req = new NextRequest('https://btc.example.com/overview');

    const missingClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };
    const res1 = await readProfileGate(missingClient as never, 'user-1', req);
    expect(res1).toBeInstanceOf(Response);
    expect((res1 as Response).headers.get('location')).toContain('/login');

    const errorClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'db down' } }),
          }),
        }),
      }),
    };
    const res2 = await readProfileGate(errorClient as never, 'user-1', req);
    expect(res2).toBeInstanceOf(Response);
    expect((res2 as Response).headers.get('location')).toContain('/login');

    const missingStatusClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { role: 'reseller', status: null, onboarding_completed: true }, error: null }),
          }),
        }),
      }),
    };
    const res3 = await readProfileGate(missingStatusClient as never, 'user-1', req);
    expect(res3).toBeInstanceOf(Response);
    expect((res3 as Response).headers.get('location')).toContain('/login');

    const validClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { role: 'reseller', status: 'active', onboarding_completed: true }, error: null }),
          }),
        }),
      }),
    };
    const res4 = await readProfileGate(validClient as never, 'user-1', req);
    expect(res4).not.toBeInstanceOf(Response);
    expect(res4).toEqual({ role: 'reseller', status: 'active', onboardingCompleted: true });
  });
});

describe('Phase L — Constant-time CRON_SECRET and Telegram secret verification', () => {
  it('verifies CRON_SECRET with constant-time compare and rejects mismatches or missing prod secret', () => {
    const secret = 'super-long-cron-secret-value-0123456789abcdef';
    vi.stubEnv('CRON_SECRET', secret);
    vi.stubEnv('NODE_ENV', 'production');

    expect(constantTimeSecretMatch(secret, secret)).toBe(true);
    expect(constantTimeSecretMatch(secret, `${secret}x`)).toBe(false);
    expect(constantTimeSecretMatch(secret, 'wrong')).toBe(false);
    expect(constantTimeSecretMatch(secret, null)).toBe(false);

    const okReq = new NextRequest('https://btc.example.com/api/platform/broadcasts/process', {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(verifyCronAuth(okReq)).toBeNull();

    const badReq = new NextRequest('https://btc.example.com/api/platform/broadcasts/process', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    expect(verifyCronAuth(badReq)?.status).toBe(401);

    vi.stubEnv('CRON_SECRET', '');
    expect(verifyCronAuth(okReq)?.status).toBe(401);
  });

  it('verifies Telegram per-bot webhook secret in constant time', () => {
    expect(verifyTelegramSecret('bot-secret-abc', 'bot-secret-abc')).toBe(true);
    expect(verifyTelegramSecret('bot-secret-abc', 'bot-secret-abd')).toBe(false);
    expect(verifyTelegramSecret('bot-secret-abc', null)).toBe(false);
  });
});

describe('Phase L — Telegram update sender enforcement & tg-chat rate limiting', () => {
  it('refuses updates with no user id unless they are a known channel_post counted on tg-chat:{botId}:{chatId}', async () => {
    mockConsumeRateLimit.mockResolvedValue({ allowed: true, needsMigration: false });

    const anonymousRes = await limitTelegramUpdate('owner', {});
    expect(anonymousRes?.status).toBe(400);
    expect(mockConsumeRateLimit).not.toHaveBeenCalled();

    const channelRes = await limitTelegramUpdate('owner', {
      channel_post: { chat: { id: -1001234567890 } },
    });
    expect(channelRes).toBeNull();
    expect(mockConsumeRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'tg-chat:owner:-1001234567890', fail: 'closed' }),
    );

    mockConsumeRateLimit.mockClear();
    const userRes = await limitTelegramUpdate('bot-1', {
      message: { from: { id: 987654321 } },
    });
    expect(userRes).toBeNull();
    expect(mockConsumeRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'tg-user:bot-1:987654321', fail: 'closed' }),
    );
  });
});

describe('Phase L — Reseller JSON isolation (no supplier leaks, no cross-tenant data, no owner figures)', () => {
  it('strips supplier names, SKUs, supplier costs, and owner figures from reseller JSON payloads', async () => {
    const TENANT_A = '11111111-1111-4111-8111-111111111111';
    const TENANT_B = '22222222-2222-4222-8222-222222222222';
    const BOT_A = '33333333-3333-4333-8333-333333333333';
    const BOT_B = '44444444-4444-4444-8444-444444444444';
    const now = new Date('2026-11-20T06:30:00.000Z');

    const db = createMemoryDb({
      suppliers: [{ id: 'sup-1', name: 'SecretProdSeller', balance_usdt: 999.5 }],
      products: [
        {
          id: 'prod-1',
          sku: 'BTC-VPN-1',
          title: 'HMA VPN 30D',
          category: 'VPN',
          status: 'published',
          delivery_type: 'supplier_api',
          supplier_id: 'sup-1',
          supplier_sku: 'SECRET-SUP-SKU-99',
          supplier_price_minor: '1500000',
          wholesale_price: '5000000',
          retail_price: '8000000',
          min_reseller_price: '5500000',
          stock_count: 10,
          stock_unlimited: false,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        },
      ],
      reseller_listings: [
        {
          id: 'list-a',
          tenant_id: TENANT_A,
          product_id: 'prod-1',
          retail_price: '9000000',
          is_visible: true,
        },
      ],
      orders: [
        {
          id: 'ord-owner',
          tenant_id: null,
          channel: 'owner_store',
          payment_status: 'verified',
          fulfillment_status: 'ready',
          delivery_status: 'sent',
          quoted_retail_price: '777000000',
          quantity: 1,
          created_at: '2026-11-20T05:00:00.000Z',
          customer_id: 'cust-owner',
          product_id: 'prod-1',
        },
        {
          id: 'ord-a',
          tenant_id: TENANT_A,
          channel: 'reseller_bot',
          payment_status: 'verified',
          fulfillment_status: 'ready',
          delivery_status: 'sent',
          quoted_retail_price: '9000000',
          quantity: 1,
          created_at: '2026-11-20T05:10:00.000Z',
          customer_id: 'cust-a',
          product_id: 'prod-1',
        },
        {
          id: 'ord-b',
          tenant_id: TENANT_B,
          channel: 'reseller_bot',
          payment_status: 'verified',
          fulfillment_status: 'ready',
          delivery_status: 'sent',
          quoted_retail_price: '555000000',
          quantity: 1,
          created_at: '2026-11-20T05:20:00.000Z',
          customer_id: 'cust-b',
          product_id: 'prod-1',
        },
      ],
      customers: [
        { id: 'cust-owner', bot_id: null, telegram_chat_id: '10001', username: 'owner_buyer', is_blocked: false },
        { id: 'cust-a', bot_id: BOT_A, telegram_chat_id: '20001', username: 'tenant_a_buyer', is_blocked: false },
        { id: 'cust-b', bot_id: BOT_B, telegram_chat_id: '30001', username: 'tenant_b_buyer', is_blocked: false },
      ],
      tenants: [
        { id: TENANT_A, display_name: 'Alpha Store' },
        { id: TENANT_B, display_name: 'Beta Store' },
      ],
      bot_connections: [
        { id: BOT_A, tenant_id: TENANT_A, status: 'connected' },
        { id: BOT_B, tenant_id: TENANT_B, status: 'connected' },
      ],
      support_threads: [],
      payment_claims: [],
      replacement_requests: [],
      wallet_topups: [],
      platform_settings: [{ id: 'ps-1', owner_bot_status: 'connected' }],
    });

    const catalogJson = JSON.stringify(
      await readCatalog(db, { role: 'reseller', tenantId: TENANT_A }, parseCatalogFilters(new URLSearchParams())),
    );
    expect(catalogJson).not.toContain('SecretProdSeller');
    expect(catalogJson).not.toContain('SECRET-SUP-SKU-99');
    expect(catalogJson).not.toContain('1500000');

    const ordersJson = JSON.stringify(
      await readOrders(db, TENANT_A, parseOrderFilters(new URLSearchParams({ search: 'ord-a,id.eq.ord-b' }))),
    );
    expect(ordersJson).not.toContain('ord-owner');
    expect(ordersJson).not.toContain('ord-b');
    expect(ordersJson).not.toContain('SecretProdSeller');

    const overview = await readOverview(
      db,
      { role: 'reseller', tenantId: TENANT_A, botId: BOT_A, firstName: 'Alpha', timezone: 'Asia/Kolkata' },
      '7d',
      now,
    );
    expect(overview.revenue).toBe('9.00 USDT');
    expect(JSON.stringify(overview)).not.toContain('777.00');
    expect(JSON.stringify(overview)).not.toContain('555.00');

    const analytics = await readAnalytics(
      db,
      { role: 'reseller', tenantId: TENANT_A, timezone: 'Asia/Kolkata' },
      '7d',
      now,
    );
    expect(analytics.revenue).toBe('9.00 USDT');
    expect(analytics.topResellers).toHaveLength(0);

    // Broadcast audience scoping: reseller A only sees BOT_A buyers (1), never owner or BOT_B
    const audience = await readAudienceCounts(db, 'reseller', TENANT_A, BOT_A);
    expect(audience.all).toBe(1);
  });
});

describe('Phase L — Error handling, HTML sanitization, and no buyer Replace button', () => {
  it('throws AppError instead of returning [] on DB errors in list helpers', async () => {
    const brokenDb = {
      from: () => ({
        select: () => ({
          order: () => ({
            limit: async () => ({ data: null, error: { message: 'connection refused' } }),
          }),
        }),
      }),
    } as unknown as DbClient;

    await expect(listStoresWithOverrides(brokenDb)).rejects.toThrow(AppError);
  });

  it('sanitizes broadcast HTML to Telegram subset and never renders a buyer Replace button', () => {
    const clean = sanitizeBotHtml('<b>Deal</b><script>alert(1)</script><img src=x onerror=alert(1)>');
    expect(clean).toContain('<b>Deal</b>');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onerror');

    const rows = layoutHomeButtons(DEFAULT_STORE_CONFIG, {
      resellerSignupEnabled: false,
      myApiEnabled: false,
    });
    const serialized = JSON.stringify(rows).toLowerCase();
    expect(serialized).not.toContain('replace');
    expect(serialized).not.toContain('warranty');
  });
});
