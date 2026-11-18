/**
 * Supplier URL guard, shared rate limit, fraud refusals, and reseller policy.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { assertPublicHttpsUrl, isBlockedIp, safeSupplierFetch } from '@/lib/safe-fetch';
import { safeCallbackPath } from '@/lib/navigation';
import { parseCatalogFilters, readCatalog } from '@/modules/platform/catalog';
import { consumeRateLimit, resetRateLimitStore, setRateLimitBump } from '@/lib/rate-limiter';
import { createOrder } from '@/modules/orders';
import { assertCustomerAllowed, noteFailedClaim } from '@/modules/platform/fraud';
import { assertResellerFieldsAllowed } from '@/modules/platform/policy';
import { recordCustomerSupport } from '@/modules/platform/support';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const CUSTOMER = '00000000-0000-4000-8000-000000000301';

afterEach(() => {
  resetRateLimitStore();
});

describe('supplier url guard', () => {
  it('refuses a private address, link-local metadata, and http', async () => {
    expect(isBlockedIp('169.254.169.254')).toBe(true);
    await expect(assertPublicHttpsUrl('https://127.0.0.1/latest')).rejects.toThrow(/not allowed/);
    await expect(assertPublicHttpsUrl('https://169.254.169.254/')).rejects.toThrow(/not allowed/);
    await expect(assertPublicHttpsUrl('http://supplier.example/products')).rejects.toThrow(/https/);
  });

  it('refuses a hostname that resolves to a private address', async () => {
    await expect(assertPublicHttpsUrl('https://supplier.example/products', async () => ['10.1.1.1'])).rejects.toThrow(/not allowed/);
  });

  it('refuses a redirect onto a private address and does not fetch it', async () => {
    const seen: string[] = [];
    await expect(
      safeSupplierFetch('https://supplier.example/start', {}, {
        resolveHost: async () => ['8.8.8.8'],
        fetchImpl: async (input) => {
          const url = String(input);
          seen.push(url);
          return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/latest' } });
        },
      }),
    ).rejects.toThrow(/not allowed/);
    expect(seen).toEqual(['https://8.8.8.8/start']);
  });

  it('refuses a name that is public on the first lookup and private on the next', async () => {
    let lookups = 0;
    const fetched: string[] = [];
    await expect(safeSupplierFetch('https://rebind.example/start', {}, {
      resolveHost: async () => {
        lookups += 1;
        return lookups === 1 ? ['1.1.1.1'] : ['10.2.2.2'];
      },
      fetchImpl: async (input) => {
        fetched.push(String(input));
        return new Response(null, { status: 302, headers: { location: 'https://rebind.example/next' } });
      },
    })).rejects.toThrow(/not allowed/);
    expect(fetched).toEqual(['https://1.1.1.1/start']);
  });

  it('times out a slow host and cuts an oversized body', async () => {
    await expect(
      safeSupplierFetch('https://supplier.example/slow', {}, {
        connectTimeoutMs: 20,
        totalTimeoutMs: 50,
        resolveHost: async () => ['8.8.8.8'],
        fetchImpl: (_input, init) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal;
            const fail = (): void => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            };
            if (signal?.aborted) {
              fail();
              return;
            }
            signal?.addEventListener('abort', fail, { once: true });
          }),
      }),
    ).rejects.toThrow(/timed out/);

    const response = await safeSupplierFetch('https://supplier.example/big', {}, {
      maxBytes: 8,
      resolveHost: async () => ['8.8.8.8'],
      fetchImpl: async () => new Response('abcdefghijklmnopqrstuvwxyz'),
    });
    expect(await response.text()).toBe('abcdefgh');
  });

  it('fetches a normal public supplier at the address that was checked', async () => {
    const seen: { url: string; host: string | null }[] = [];
    const response = await safeSupplierFetch('https://supplier.example/products', {}, {
      resolveHost: async () => ['8.8.8.8'],
      fetchImpl: async (input, init) => {
        seen.push({ url: String(input), host: new Headers(init?.headers).get('host') });
        return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(seen).toEqual([{ url: 'https://8.8.8.8/products', host: 'supplier.example' }]);
  });
});

describe('search filters', () => {
  it('keeps PostgREST operator characters out of an or() string', async () => {
    const db = createMemoryDb({
      products: [{ id: '00000000-0000-4000-8000-000000000101', title: 'Gemini', sku: 'GM', status: 'published', stock_unlimited: true, supplier_id: null }],
      supplier_products: [],
      suppliers: [],
    });
    const calls: string[] = [];
    const original = db.from.bind(db);
    db.from = (table: string) => {
      const builder = original(table);
      const or = builder.or.bind(builder);
      builder.or = (expression: string) => {
        calls.push(expression);
        return or(expression);
      };
      return builder;
    };
    await readCatalog(db, { role: 'owner', tenantId: null }, parseCatalogFilters(new URLSearchParams('search=title.eq.hacked,or.id')));
    expect(calls).toEqual([]);
  });
});

describe('callback next', () => {
  it('refuses an off-site next and keeps an in-app path', () => {
    expect(safeCallbackPath('https://evil.example/phish', 'owner', '/overview')).toBe('/overview');
    expect(safeCallbackPath('//evil.example', 'owner', '/overview')).toBe('/overview');
    expect(safeCallbackPath('/orders?order=1', 'owner', '/overview')).toBe('/orders?order=1');
  });
});

describe('shared rate limit', () => {
  it('holds one count across two simulated instances', async () => {
    const rows = new Map<string, number>();
    setRateLimitBump(async (bucket, start) => {
      const key = `${bucket}|${start.toISOString()}`;
      const next = (rows.get(key) ?? 0) + 1;
      rows.set(key, next);
      return next;
    });
    const first = await consumeRateLimit({ key: 'shared', limit: 1, fail: 'closed' });
    const second = await consumeRateLimit({ key: 'shared', limit: 1, fail: 'closed' });
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
  });

  it('fails closed on auth and money and open on a read', async () => {
    setRateLimitBump(async () => {
      throw new Error('database unavailable');
    });
    const closed = await consumeRateLimit({ key: 'auth:login', limit: 5, fail: 'closed' });
    const open = await consumeRateLimit({ key: 'read:catalog', limit: 5, fail: 'open' });
    expect(closed.allowed).toBe(false);
    expect(open.allowed).toBe(true);
    setRateLimitBump(async () => {
      throw new Error('function bump_rate_limit does not exist');
    });
    const missing = await consumeRateLimit({ key: 'wallet:redeem', limit: 5, fail: 'closed' });
    expect(missing.allowed).toBe(false);
    expect(missing.needsMigration).toBe(true);
  });
});

describe('fraud and reseller policy', () => {
  it('refuses a blocked customer who tries to buy or message, and writes the reason', async () => {
    const db = createMemoryDb({
      customers: [{ id: CUSTOMER, is_blocked: true, created_at: '2026-01-01T00:00:00.000Z' }],
      platform_settings: [{ id: 'ps', fraud_orders_per_hour: 20 }],
    });
    await expect(createOrder(db, {
      channel: 'owner_store',
      botId: 'owner',
      customerId: CUSTOMER,
      productId: '00000000-0000-4000-8000-000000000101',
      idempotencyKey: 'blocked-buy',
    })).rejects.toMatchObject({ code: 'CUSTOMER_BLOCKED' });
    const message = await recordCustomerSupport(db, {
      tenantId: null,
      customerId: CUSTOMER,
      botId: null,
      body: 'I need help',
    });
    expect(message.ok).toBe(false);
    if (!message.ok) expect(message.reason).toBe('blocked');
    const reasons = (db.tables.audit_log ?? []).map((row) => String(row.reason));
    expect(reasons.some((reason) => reason.includes('blocked'))).toBe(true);
    expect(db.tables.orders ?? []).toHaveLength(0);
  });

  it('refuses a new account that is over the order cap and records a failed claim', async () => {
    const db = createMemoryDb({
      customers: [{ id: CUSTOMER, is_blocked: false, created_at: new Date().toISOString() }],
      platform_settings: [{
        id: 'ps',
        fraud_orders_per_hour: 20,
        fraud_orders_per_day: 50,
        fraud_failed_claims_per_hour: 1,
        fraud_support_messages_per_hour: 30,
        fraud_referral_claims_per_day: 10,
        fraud_new_account_order_cap: 1,
        fraud_new_account_age_hours: 24,
      }],
      orders: [{ id: 'o1', customer_id: CUSTOMER, created_at: new Date().toISOString() }],
    });
    await expect(assertCustomerAllowed(db, CUSTOMER, 'order')).rejects.toMatchObject({ code: 'FRAUD_LIMIT' });
    await noteFailedClaim(db, CUSTOMER, 'The amount did not match.');
    await expect(assertCustomerAllowed(db, CUSTOMER, 'claim')).rejects.toMatchObject({ code: 'FRAUD_LIMIT' });
    expect((db.tables.audit_log ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('rejects a policy-locked field and leaves the stored value alone', async () => {
    const db = createMemoryDb({
      platform_settings: [{ id: 'ps', reseller_policy: { markupPercent: false } }],
      tenant_settings: [{ tenant_id: 't', markup_percent: 12 }],
    });
    await expect(assertResellerFieldsAllowed(db, ['markupPercent'])).rejects.toThrow(/locked Markup/);
    expect(db.tables.tenant_settings?.[0]?.markup_percent).toBe(12);
    const open = createMemoryDb({ platform_settings: [{ id: 'ps', reseller_policy: {} }] });
    await expect(assertResellerFieldsAllowed(open, ['storeName'])).resolves.toBeUndefined();
  });
});
