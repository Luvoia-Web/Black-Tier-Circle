/**
 * @file tests/unit/supplier-sync-route.test.ts
 *
 * POST /api/supplier/sync processes ONE supplier per call (oldest last-synced first),
 * sanitizes errors so API keys are never stored or returned, and rotates past failures.
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
      insert: async () => ({ data: null, error: null }),
    }),
  }),
}));

vi.mock('@/modules/supplier', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/supplier')>();
  return {
    ...actual,
    listSuppliers,
    syncSupplierProducts,
  };
});

import { POST } from '@/app/api/supplier/sync/route';

beforeEach(() => {
  updates.length = 0;
  listSuppliers.mockReset();
  syncSupplierProducts.mockReset();
});

describe('POST /api/supplier/sync', () => {
  it('syncs ONE supplier (oldest first), scrubs secrets on failure, and rotates to the next on the following call', async () => {
    const bad = {
      id: 'bad',
      name: 'Bad Co',
      status: 'active',
      hasApiKey: true,
      lastSyncAt: '2026-10-01T00:00:00.000Z',
      lastSyncError: null as string | null,
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    const good = {
      id: 'good',
      name: 'Good Co',
      status: 'active',
      hasApiKey: true,
      lastSyncAt: '2026-10-02T00:00:00.000Z',
      lastSyncError: null as string | null,
      updatedAt: '2026-10-02T00:00:00.000Z',
    };
    listSuppliers.mockImplementation(async () => [good, bad]);
    syncSupplierProducts.mockImplementation(async (_db: unknown, id: string) => {
      if (id === 'bad') {
        throw new Error('GET https://canboso.com/api/v2/telegram-buyer/products?key=tgb_SECRET {"products":[]}');
      }
      return {
        synced: 2,
        newProducts: 1,
        updatedProducts: 1,
        outOfStock: 0,
        stockChanged: 0,
        repriced: 0,
        autoPaused: 0,
        truncated: false,
        durationMs: 12,
        errors: [],
      };
    });

    // First call picks 'bad' (oldest lastSyncAt)
    const firstRes = await POST(new NextRequest('http://localhost/api/supplier/sync', { method: 'POST' }));
    const firstJson = (await firstRes.json()) as {
      success: boolean;
      data: {
        supplierId: string;
        supplierName: string;
        durationMs: number;
        totalActiveSuppliers: number;
        remainingSuppliers: number;
        results: Array<Record<string, unknown>>;
      };
    };

    expect(firstRes.status).toBe(200);
    expect(firstJson.success).toBe(true);
    expect(syncSupplierProducts).toHaveBeenCalledTimes(1);
    expect(firstJson.data.supplierId).toBe('bad');
    expect(firstJson.data.supplierName).toBe('Bad Co');
    expect(typeof firstJson.data.durationMs).toBe('number');
    expect(firstJson.data.totalActiveSuppliers).toBe(2);
    expect(firstJson.data.remainingSuppliers).toBe(1);
    expect(firstJson.data.results[0]).toMatchObject({
      supplierId: 'bad',
      name: 'Bad Co',
      ok: false,
      synced: 0,
      errors: ['Supplier sync failed'],
    });
    expect(JSON.stringify(firstJson)).not.toContain('tgb_SECRET');
    expect(JSON.stringify(firstJson)).not.toContain('key=');
    expect(JSON.stringify(firstJson)).not.toContain('canboso.com');
    expect(updates[0]?.last_sync_error).toBe('Supplier sync failed');

    // Simulate DB persisting the error & updated_at on 'bad' — next call must rotate to 'good'
    bad.lastSyncError = String(updates[0]?.last_sync_error);
    bad.updatedAt = String(updates[0]?.updated_at);

    const secondRes = await POST(new NextRequest('http://localhost/api/supplier/sync', { method: 'POST' }));
    const secondJson = (await secondRes.json()) as {
      success: boolean;
      data: { supplierId: string; supplierName: string; results: Array<Record<string, unknown>> };
    };

    expect(secondRes.status).toBe(200);
    expect(syncSupplierProducts).toHaveBeenCalledTimes(2);
    expect(secondJson.data.supplierId).toBe('good');
    expect(secondJson.data.supplierName).toBe('Good Co');
    expect(secondJson.data.results[0]).toMatchObject({
      supplierId: 'good',
      name: 'Good Co',
      ok: true,
      synced: 2,
      newProducts: 1,
      updatedProducts: 1,
      errors: [],
    });
  });
});
