import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/lib/errors';
import { parseGoalUsdt, readRevenueGoal, writeRevenueGoal } from '@/modules/platform/goal';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const OWNER = '00000000-0000-4000-8000-0000000000aa';
const TENANT_A = '00000000-0000-4000-8000-0000000000a1';
const TENANT_B = '00000000-0000-4000-8000-0000000000a2';

function seeded() {
  return createMemoryDb({
    platform_settings: [{ id: OWNER, revenue_goal_minor: '1600000000' }],
    tenant_settings: [
      { id: '00000000-0000-4000-8000-0000000000b1', tenant_id: TENANT_A, revenue_goal_minor: '500000000' },
      { id: '00000000-0000-4000-8000-0000000000b2', tenant_id: TENANT_B, revenue_goal_minor: '900000000' },
    ],
  });
}

function missingColumnDb(): DbClient {
  const missing: QueryResult<unknown> = {
    data: null,
    error: { code: '42703', message: 'column revenue_goal_minor does not exist' },
  };
  const builder = {
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    delete: () => builder,
    eq: () => builder,
    in: () => builder,
    is: () => builder,
    gte: () => builder,
    lte: () => builder,
    order: () => builder,
    limit: () => builder,
    range: () => builder,
    or: () => builder,
    ilike: () => builder,
    maybeSingle: async () => missing,
    single: async () => missing,
    then: (onfulfilled?: ((value: QueryResult<unknown[]>) => unknown) | null) =>
      Promise.resolve({ data: [], error: missing.error }).then(onfulfilled),
  };
  return { from: () => builder, rpc: async () => missing } as DbClient;
}

describe('revenue goal', () => {
  it('reads the owner goal from platform settings', async () => {
    const goal = await readRevenueGoal(seeded(), { role: 'owner', tenantId: null });
    expect(goal.needsMigration).toBe(false);
    expect(goal.goalMinor).toBe('1600000000');
    expect(goal.goalUsdt).toBe('1600.000000');
  });

  it('writes the owner goal and leaves reseller rows alone', async () => {
    const db = seeded();
    const saved = await writeRevenueGoal(db, { role: 'owner', tenantId: null }, 2000000000n);
    expect(saved.goalMinor).toBe('2000000000');
    expect(db.tables.platform_settings?.[0]?.revenue_goal_minor).toBe('2000000000');
    expect(db.tables.tenant_settings?.[0]?.revenue_goal_minor).toBe('500000000');
    expect(db.tables.tenant_settings?.[1]?.revenue_goal_minor).toBe('900000000');
  });

  it('writes only the signed-in reseller store', async () => {
    const db = seeded();
    const saved = await writeRevenueGoal(db, { role: 'reseller', tenantId: TENANT_A }, 700000000n);
    expect(saved.goalUsdt).toBe('700.000000');
    expect(db.tables.tenant_settings?.[0]?.revenue_goal_minor).toBe('700000000');
    expect(db.tables.tenant_settings?.[1]?.revenue_goal_minor).toBe('900000000');
    expect(db.tables.platform_settings?.[0]?.revenue_goal_minor).toBe('1600000000');
    const other = await readRevenueGoal(db, { role: 'reseller', tenantId: TENANT_B });
    expect(other.goalMinor).toBe('900000000');
  });

  it('inserts a reseller settings row when the store has none', async () => {
    const db = createMemoryDb({ platform_settings: [{ id: OWNER, revenue_goal_minor: null }] });
    const saved = await writeRevenueGoal(db, { role: 'reseller', tenantId: TENANT_A }, 0n);
    expect(saved.goalMinor).toBe('0');
    expect(db.tables.tenant_settings ?? []).toHaveLength(1);
    expect(db.tables.tenant_settings?.[0]?.tenant_id).toBe(TENANT_A);
  });

  it('reports a missing column instead of failing the ring', async () => {
    const db = missingColumnDb();
    const read = await readRevenueGoal(db, { role: 'owner', tenantId: null });
    const written = await writeRevenueGoal(db, { role: 'reseller', tenantId: TENANT_A }, 1000000n);
    expect(read.needsMigration).toBe(true);
    expect(written.needsMigration).toBe(true);
  });

  it('rejects a goal that is not zero or more', () => {
    expect(parseGoalUsdt('0').toString()).toBe('0');
    expect(() => parseGoalUsdt('-1')).toThrow(ValidationError);
    expect(() => parseGoalUsdt('')).toThrow(ValidationError);
  });
});
