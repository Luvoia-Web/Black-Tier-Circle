/**
 * @file tests/unit/public-api.test.ts
 *
 * Unit tests for API keys, rate limiting, webhooks, and v1 route guards.
 *
 * @module Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_CONFIG } from '@/lib/api-config';
import { AuthError, ValidationError } from '@/lib/errors';
import { checkRateLimit, resetRateLimitStore } from '@/lib/rate-limiter';
import {
  authenticateApiRequest,
  generateApiKey,
  hashApiKey,
  listApiKeys,
  requireScope,
  revokeApiKey,
} from '@/modules/public-api';
import {
  assertHttpsWebhookUrl,
  dispatchWebhook,
  registerWebhookEndpoint,
  signWebhookPayload,
  verifyWebhookSignature,
} from '@/modules/public-api/webhooks';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const { harness, TENANT_ID, OTHER_TENANT, WALLET_ID, PRODUCT_ID, OTHER_PRODUCT, PROFILE_ID } = vi.hoisted(() => {
  const TENANT_ID = '00000000-0000-4000-8000-000000000010';
  const OTHER_TENANT = '00000000-0000-4000-8000-000000000011';
  const WALLET_ID = '00000000-0000-4000-8000-000000000020';
  const PRODUCT_ID = '00000000-0000-4000-8000-000000000101';
  const OTHER_PRODUCT = '00000000-0000-4000-8000-000000000102';
  const PROFILE_ID = '00000000-0000-4000-8000-000000000002';
  return {
    TENANT_ID,
    OTHER_TENANT,
    WALLET_ID,
    PRODUCT_ID,
    OTHER_PRODUCT,
    PROFILE_ID,
    harness: {
      ctx: {
        tenantId: TENANT_ID,
        apiKeyId: '00000000-0000-4000-8000-000000000099',
        scopes: [
          'orders:read',
          'orders:write',
          'products:read',
          'payments:write',
          'webhook:manage',
        ] as const,
        environment: 'test' as const,
      },
      db: null as ReturnType<typeof createMemoryDb> | null,
    },
  };
});

vi.mock('@/lib/v1-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/v1-auth')>();
  return {
    ...actual,
    authenticateV1Request: vi.fn(async () => ({
      tenantId: harness.ctx.tenantId,
      apiKeyId: harness.ctx.apiKeyId,
      scopes: [...harness.ctx.scopes],
      environment: harness.ctx.environment,
    })),
    v1Db: () => harness.db as NonNullable<typeof harness.db>,
  };
});

function seedDb() {
  return createMemoryDb({
    tenants: [
      {
        id: TENANT_ID,
        owner_user_id: PROFILE_ID,
        display_name: 'Sandbox Reseller',
        business_name: null,
        support_contact: null,
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: OTHER_TENANT,
        owner_user_id: PROFILE_ID,
        display_name: 'Other Reseller',
        business_name: null,
        support_contact: null,
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    products: [
      {
        id: PRODUCT_ID,
        sku: 'EBOOK-DEMO-001',
        title: 'Demo Ebook',
        description: 'Synthetic test product',
        category: 'ebooks',
        delivery_type: 'file_reusable',
        status: 'published',
        wholesale_price: '5000000',
        retail_price: '10000000',
        stock_unlimited: true,
        stock_count: null,
        reseller_eligible: true,
        max_purchase_qty: 1,
        estimated_delivery_minutes: null,
        version: 1,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: OTHER_PRODUCT,
        sku: 'EBOOK-DEMO-002',
        title: 'Other Ebook',
        description: 'Other tenant product',
        category: 'ebooks',
        delivery_type: 'file_reusable',
        status: 'published',
        wholesale_price: '5000000',
        retail_price: '10000000',
        stock_unlimited: true,
        stock_count: null,
        reseller_eligible: true,
        max_purchase_qty: 1,
        estimated_delivery_minutes: null,
        version: 1,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    reseller_listings: [
      {
        id: '00000000-0000-4000-8000-000000000401',
        tenant_id: TENANT_ID,
        product_id: PRODUCT_ID,
        retail_price: '12000000',
        is_visible: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000402',
        tenant_id: OTHER_TENANT,
        product_id: OTHER_PRODUCT,
        retail_price: '15000000',
        is_visible: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    wallets: [
      {
        id: WALLET_ID,
        tenant_id: TENANT_ID,
        balance_total: '20000000',
        balance_reserved: '0',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  });
}

describe('API key management', () => {
  it('generateApiKey creates key with correct format btc_{env}_{32hex}', async () => {
    const db = seedDb();
    const created = await generateApiKey(db, {
      tenantId: TENANT_ID,
      label: 'Production Key',
      environment: 'live',
      createdBy: PROFILE_ID,
    });
    expect(created.rawKey).toMatch(/^btc_live_[0-9a-f]{32}$/);
  });

  it('generateApiKey stores hash not raw key', async () => {
    const db = seedDb();
    const created = await generateApiKey(db, {
      tenantId: TENANT_ID,
      label: 'Test Key',
      environment: 'test',
      createdBy: PROFILE_ID,
    });
    const stored = db.tables.api_keys?.[0];
    expect(stored?.key_hash).toBe(hashApiKey(created.rawKey));
    expect(stored?.key_hash).not.toBe(created.rawKey);
    expect(JSON.stringify(stored)).not.toContain(created.rawKey);
  });

  it('generateApiKey returns rawKey only once (not in subsequent reads)', async () => {
    const db = seedDb();
    const created = await generateApiKey(db, {
      tenantId: TENANT_ID,
      label: 'Once',
      environment: 'test',
      createdBy: PROFILE_ID,
    });
    const listed = await listApiKeys(db, TENANT_ID);
    expect(created.rawKey).toBeTruthy();
    expect(JSON.stringify(listed)).not.toContain(created.rawKey);
    expect(listed[0]?.keyPrefix).toBe(created.apiKey.keyPrefix);
  });

  it('authenticateApiRequest with valid key returns context', async () => {
    const db = seedDb();
    const created = await generateApiKey(db, {
      tenantId: TENANT_ID,
      label: 'Auth',
      environment: 'test',
      createdBy: PROFILE_ID,
    });
    const ctx = await authenticateApiRequest(db, created.rawKey);
    expect(ctx.tenantId).toBe(TENANT_ID);
    expect(ctx.apiKeyId).toBe(created.apiKey.id);
  });

  it('authenticateApiRequest with invalid key throws AuthError', async () => {
    const db = seedDb();
    await expect(authenticateApiRequest(db, 'btc_test_ffffffffffffffffffffffffffffffff')).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it('authenticateApiRequest with revoked key throws AuthError', async () => {
    const db = seedDb();
    const created = await generateApiKey(db, {
      tenantId: TENANT_ID,
      label: 'Revoke me',
      environment: 'test',
      createdBy: PROFILE_ID,
    });
    await revokeApiKey(db, created.apiKey.id, PROFILE_ID);
    await expect(authenticateApiRequest(db, created.rawKey)).rejects.toBeInstanceOf(AuthError);
  });

  it('authenticateApiRequest with expired key throws AuthError', async () => {
    const db = seedDb();
    const created = await generateApiKey(db, {
      tenantId: TENANT_ID,
      label: 'Expired',
      environment: 'test',
      createdBy: PROFILE_ID,
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    await expect(authenticateApiRequest(db, created.rawKey)).rejects.toBeInstanceOf(AuthError);
  });

  it('requireScope with missing scope throws AuthError FORBIDDEN', () => {
    expect(() =>
      requireScope(
        { tenantId: TENANT_ID, apiKeyId: 'k', scopes: ['products:read'], environment: 'test' },
        'orders:write',
      ),
    ).toThrow(AuthError);
    try {
      requireScope(
        { tenantId: TENANT_ID, apiKeyId: 'k', scopes: ['products:read'], environment: 'test' },
        'orders:write',
      );
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).code).toBe(API_CONFIG.errors.FORBIDDEN);
    }
  });

  it('revokeApiKey sets is_active=false', async () => {
    const db = seedDb();
    const created = await generateApiKey(db, {
      tenantId: TENANT_ID,
      label: 'Revoke',
      environment: 'test',
      createdBy: PROFILE_ID,
    });
    await revokeApiKey(db, created.apiKey.id, PROFILE_ID);
    expect(db.tables.api_keys?.[0]?.is_active).toBe(false);
  });
});

describe('rate limiting', () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it('checkRateLimit allows requests below limit', () => {
    expect(checkRateLimit('k1', 2).allowed).toBe(true);
    expect(checkRateLimit('k1', 2).allowed).toBe(true);
  });

  it('checkRateLimit blocks requests at limit', () => {
    checkRateLimit('k2', 1);
    expect(checkRateLimit('k2', 1).allowed).toBe(false);
    expect(checkRateLimit('k2', 1).remaining).toBe(0);
  });

  it('checkRateLimit resets after window expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    checkRateLimit('k3', 1, 1_000);
    expect(checkRateLimit('k3', 1, 1_000).allowed).toBe(false);
    vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'));
    expect(checkRateLimit('k3', 1, 1_000).allowed).toBe(true);
    vi.useRealTimers();
  });

  it('different keys have independent rate limits', () => {
    checkRateLimit('alpha', 1);
    expect(checkRateLimit('alpha', 1).allowed).toBe(false);
    expect(checkRateLimit('beta', 1).allowed).toBe(true);
  });
});

describe('webhooks', () => {
  it('dispatchWebhook signs payload with HMAC-SHA256', async () => {
    const db = seedDb();
    const created = await registerWebhookEndpoint(db, {
      tenantId: TENANT_ID,
      url: 'https://reseller.example/hooks',
      events: ['order.payment_verified'],
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await dispatchWebhook(db, TENANT_ID, 'order.payment_verified', { orderId: 'ord-1' });
    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = String(init.body);
    const signature = (init.headers as Record<string, string>)[API_CONFIG.webhooks.signatureHeader];
    expect(signature).toBe(signWebhookPayload(body, created.rawSecret));
    vi.unstubAllGlobals();
  });

  it('verifyWebhookSignature returns true for valid signature', () => {
    const payload = '{"ok":true}';
    const secret = 'super-secret';
    const signature = signWebhookPayload(payload, secret);
    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
  });

  it('verifyWebhookSignature returns false for tampered payload', () => {
    const secret = 'super-secret';
    const signature = signWebhookPayload('{"ok":true}', secret);
    expect(verifyWebhookSignature('{"ok":false}', signature, secret)).toBe(false);
  });

  it('webhook URL must be https:// (http:// rejected)', async () => {
    expect(() => assertHttpsWebhookUrl('http://insecure.example/hook')).toThrow(ValidationError);
    const db = seedDb();
    await expect(
      registerWebhookEndpoint(db, {
        tenantId: TENANT_ID,
        url: 'http://insecure.example/hook',
        events: ['order.failed'],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('v1 routes', () => {
  beforeEach(() => {
    harness.db = seedDb();
    harness.ctx.tenantId = TENANT_ID;
  });

  afterEach(() => {
    harness.db = null;
  });

  it('GET /api/v1/products returns only tenant listed products', async () => {
    const { GET } = await import('@/app/api/v1/products/route');
    const response = await GET(new Request('http://localhost/api/v1/products') as never);
    const json = (await response.json()) as { success: boolean; data: Array<{ id: string }> };
    expect(json.success).toBe(true);
    expect(json.data.map((row) => row.id)).toEqual([PRODUCT_ID]);
  });

  it('POST /api/v1/orders without idempotency key returns 400', async () => {
    const { POST } = await import('@/app/api/v1/orders/route');
    const response = await POST(
      new Request('http://localhost/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: PRODUCT_ID, customerRef: 'cust-1' }),
      }) as never,
    );
    expect(response.status).toBe(400);
    const json = (await response.json()) as { success: boolean; error: { code: string } };
    expect(json.success).toBe(false);
    expect(json.error.code).toBe(API_CONFIG.errors.VALIDATION_ERROR);
  });

  it('POST /api/v1/orders with same idempotency key twice returns same order', async () => {
    const { POST } = await import('@/app/api/v1/orders/route');
    const headers = {
      'Content-Type': 'application/json',
      [API_CONFIG.idempotencyHeader]: 'idem-1',
    };
    const body = JSON.stringify({ productId: PRODUCT_ID, customerRef: 'cust-1' });
    const first = await POST(
      new Request('http://localhost/api/v1/orders', { method: 'POST', headers, body }) as never,
    );
    const second = await POST(
      new Request('http://localhost/api/v1/orders', { method: 'POST', headers, body }) as never,
    );
    const a = (await first.json()) as { success: boolean; data: { orderId: string } };
    const b = (await second.json()) as { success: boolean; data: { orderId: string } };
    expect(first.status).toBe(201);
    expect(a.data.orderId).toBe(b.data.orderId);
  });

  it('GET /api/v1/orders/[orderId] returns 403 for wrong tenant', async () => {
    const { POST } = await import('@/app/api/v1/orders/route');
    const created = await POST(
      new Request('http://localhost/api/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [API_CONFIG.idempotencyHeader]: 'idem-2',
        },
        body: JSON.stringify({ productId: PRODUCT_ID, customerRef: 'cust-2' }),
      }) as never,
    );
    const json = (await created.json()) as { data: { orderId: string } };
    harness.ctx.tenantId = OTHER_TENANT;
    const { GET } = await import('@/app/api/v1/orders/[orderId]/route');
    const response = await GET(new Request(`http://localhost/api/v1/orders/${json.data.orderId}`) as never, {
      params: { orderId: json.data.orderId },
    });
    expect(response.status).toBe(403);
  });

  it('POST /api/v1/orders/[orderId]/pay/bep20 with invalid txHash returns 400', async () => {
    const { POST: create } = await import('@/app/api/v1/orders/route');
    const created = await create(
      new Request('http://localhost/api/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [API_CONFIG.idempotencyHeader]: 'idem-3',
        },
        body: JSON.stringify({ productId: PRODUCT_ID, customerRef: 'cust-3' }),
      }) as never,
    );
    const json = (await created.json()) as { data: { orderId: string } };
    const { POST } = await import('@/app/api/v1/orders/[orderId]/pay/bep20/route');
    const response = await POST(
      new Request(`http://localhost/api/v1/orders/${json.data.orderId}/pay/bep20`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: 'not-a-hash' }),
      }) as never,
      { params: { orderId: json.data.orderId } },
    );
    expect(response.status).toBe(400);
  });
});
