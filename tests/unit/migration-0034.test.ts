import { describe, expect, it } from 'vitest';
import { reorderPointOf } from '@/modules/platform/inventory';
import { recordBalanceSnapshot } from '@/modules/supplier/balance-snapshot';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';
import type { DbClient, QueryResult } from '@/lib/supabase/query';

describe('migration 0034 fallbacks', () => {
  it('uses 10 when a product has no reorder point', () => {
    expect(reorderPointOf(null)).toBe(10);
    expect(reorderPointOf(undefined)).toBe(10);
    expect(reorderPointOf(4)).toBe(4);
    expect(reorderPointOf(-1)).toBe(10);
  });

  it('records a balance snapshot, and reports a missing table', async () => {
    const db = createMemoryDb();
    expect(await recordBalanceSnapshot(db, 'sup-1', 12.5)).toBe('saved');
    expect(db.tables.supplier_balance_snapshots?.[0]).toMatchObject({ supplier_id: 'sup-1', balance_usdt: 12.5 });
    const missing: DbClient = {
      from: () => ({
        insert: () => Promise.resolve({ data: null, error: { code: '42P01', message: 'relation does not exist' } } as QueryResult<unknown>),
      }),
    } as unknown as DbClient;
    expect(await recordBalanceSnapshot(missing, 'sup-1', 1)).toBe('needs-migration');
  });
});
