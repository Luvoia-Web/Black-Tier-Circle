/**
 * @file tests/unit/supplier-sync-route.test.ts
 *
 * One failing supplier must not stop the rest of the sync run.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { listSuppliers, syncSupplierProducts, updates } = vi.hoisted(() => ({
  listSuppliers: vi.fn(),
  syncSupplierProducts: vi.fn(),
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/cron-auth', () => ({
  authorizeCronOrOwner: vi.fn(async () => null),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        eq: async () => {
          updates.push(payload);
          return { data: null, error: null };
        },
      }),
    }),
  }),
}));

vi.mock('@/modules/supplier', () => ({
  listSuppliers,
  syncSupplierProducts,
}));

import { POST } from '@/app/api/supplier/sync/route';

beforeEach(() => {
  updates.length = 0;
  listSuppliers.mockReset();
  syncSupplierProducts.mockReset();
});

describe('POST /api/supplier/sync', () => {
  it('keeps going when one supplier fails and does not store the API key', async () => {
    listSuppliers.mockResolvedValue([
      { id: 'bad', name: 'Bad Co', status: 'active', hasApiKey: true },
      { id: 'good', name: 'Good Co', status: 'active', hasApiKey: true },
    ]);
    syncSupplierProducts.mockImplementation(async (_db: unknown, id: string) => {
      if (id === 'bad') {
        throw new Error('GET https://canboso.com/api/v2/telegram-buyer/products?key=tgb_SECRET {"products":[]}');
      }
      return { synced: 2, newProducts: 1, updatedProducts: 1, outOfStock: 0, errors: [] };
    });

    const response = await POST(new NextRequest('http://localhost/api/supplier/sync', { method: 'POST' }));
    const json = (await response.json()) as {
      success: boolean;
      data: { results: Array<Record<string, unknown>> };
    };

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(syncSupplierProducts).toHaveBeenCalledTimes(2);
    const [failed, synced] = json.data.results;
    expect(failed).toMatchObject({
      supplierId: 'bad',
      name: 'Bad Co',
      ok: false,
      synced: 0,
      newProducts: 0,
      updatedProducts: 0,
      outOfStock: 0,
      errors: ['Supplier sync failed'],
    });
    expect(synced).toMatchObject({
      supplierId: 'good',
      name: 'Good Co',
      ok: true,
      synced: 2,
      newProducts: 1,
      updatedProducts: 1,
      outOfStock: 0,
      errors: [],
    });
    expect(typeof failed?.durationMs).toBe('number');
    expect(JSON.stringify(json)).not.toContain('tgb_SECRET');
    expect(JSON.stringify(json)).not.toContain('key=');
    expect(JSON.stringify(json)).not.toContain('canboso.com');
    expect(updates[0]?.last_sync_error).toBe('Supplier sync failed');
  });
});
