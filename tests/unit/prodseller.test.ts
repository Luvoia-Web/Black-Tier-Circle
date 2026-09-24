/**
 * @file tests/unit/prodseller.test.ts
 *
 * ProdSeller client errors and publish price rules. No live network calls.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProdSellerClient, SupplierError } from '@/integrations/prodseller/client';
import { assertPublishPrices, mapSupplierOrder } from '@/modules/supplier';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProdSellerClient', () => {
  it('sends the API key and Idempotency-Key headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        orderId: 'ps-1',
        status: 'delivered',
        product: { id: 'sku-1', name: 'Key' },
        quantity: 1,
        amount: 1,
        deliveredKey: 'KEY-1',
        createdAt: new Date().toISOString(),
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new ProdSellerClient('psk_test', 'https://prodseller.com/v1', 'X-API-Key');
    const order = await client.createOrder({ productId: 'sku-1', idempotencyKey: 'order-1', email: 'a@b.co' });
    expect(order.deliveredKey).toBe('KEY-1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://prodseller.com/v1/orders');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('psk_test');
    expect(headers['Idempotency-Key']).toBe('order-1');
    expect(JSON.parse(String(init.body))).toEqual({ productId: 'sku-1', email: 'a@b.co' });
  });

  it('maps HTTP failures to SupplierError codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
        headers: { get: () => null },
        json: async () => ({ error: 'balance too low' }),
      }),
    );
    const client = new ProdSellerClient('psk_test');
    await expect(client.getBalance()).rejects.toMatchObject({
      code: 'INSUFFICIENT_SUPPLIER_BALANCE',
      status: 402,
    });
  });

  it('maps a timeout to SUPPLIER_TIMEOUT', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    );
    const client = new ProdSellerClient('psk_test');
    await expect(client.listProducts()).rejects.toBeInstanceOf(SupplierError);
    await expect(client.listProducts()).rejects.toMatchObject({ code: 'SUPPLIER_TIMEOUT' });
  });
});

describe('supplier pricing', () => {
  it('rejects wholesale at or below supplier cost', () => {
    expect(() => assertPublishPrices(100n, 100n, 200n)).toThrowError(/above the supplier cost/);
  });

  it('rejects retail below wholesale', () => {
    expect(() => assertPublishPrices(100n, 150n, 140n)).toThrowError(/at least the wholesale/);
  });

  it('maps an activation order to polling', () => {
    const mapped = mapSupplierOrder({
      orderId: 'ps-9',
      status: 'paid',
      product: { id: '1', name: 'Mail' },
      quantity: 1,
      amount: 2,
      createdAt: new Date().toISOString(),
    });
    expect(mapped.requiresPolling).toBe(true);
    expect(mapped.status).toBe('paid');
  });
});
