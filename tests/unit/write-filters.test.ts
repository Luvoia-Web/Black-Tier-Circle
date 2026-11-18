/**
 * Writes through the live query adapter must keep their filters.
 * These tests build a real Supabase query builder against a stub fetch.
 * Nothing is sent to the network.
 */

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { asDbClient } from '@/lib/auth/session';
import { UNFILTERED_WRITE } from '@/lib/supabase/query';

function recordedClient() {
  const requests: { url: string; method: string }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    requests.push({ url, method });
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json', 'content-range': '*/0' },
    });
  };
  const client = createClient('http://127.0.0.1:54321', 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchImpl },
  });
  return { db: asDbClient(client as never), requests };
}

describe('write filters on the live client', () => {
  it('puts a filter that was set before update into the request URL', async () => {
    const { db, requests } = recordedClient();
    await db.from('orders').eq('id', 'abc').update({ status: 'ready' });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('PATCH');
    expect(requests[0]?.url).toContain('/orders');
    expect(requests[0]?.url).toContain('id=eq.abc');
  });

  it('puts a filter that was set before delete into the request URL', async () => {
    const { db, requests } = recordedClient();
    await db.from('orders').eq('id', 'abc').delete();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('DELETE');
    expect(requests[0]?.url).toContain('id=eq.abc');
  });

  it('keeps a filter that is chained after update', async () => {
    const { db, requests } = recordedClient();
    await db.from('orders').update({ status: 'ready' }).eq('id', 'abc');
    expect(requests[0]?.url).toContain('id=eq.abc');
  });

  it('refuses an update that has no filter and does not send it', async () => {
    const { db, requests } = recordedClient();
    await expect(db.from('orders').update({ status: 'ready' })).rejects.toThrow(UNFILTERED_WRITE);
    expect(requests).toEqual([]);
  });

  it('refuses an upsert and a delete that have no filter', async () => {
    const { db, requests } = recordedClient();
    const orders = db.from('orders') as unknown as { upsert: (values: Record<string, unknown>) => Promise<unknown> };
    await expect(orders.upsert({ id: 'abc', status: 'ready' })).rejects.toThrow(UNFILTERED_WRITE);
    await expect(db.from('orders').delete()).rejects.toThrow(UNFILTERED_WRITE);
    expect(requests).toEqual([]);
  });
});
