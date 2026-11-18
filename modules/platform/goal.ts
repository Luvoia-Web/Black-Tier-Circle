/**
 * Per-store revenue goal for the sidebar ring.
 * The owner store lives on platform_settings. A reseller store lives on
 * tenant_settings. While migration 0033 is unapplied the column is missing
 * and the caller falls back to localStorage.
 */

import { AppError, ValidationError } from '@/lib/errors';
import { minorToUsdt, usdtToMinor } from '@/lib/money';
import type { DbClient, QueryResult } from '@/lib/supabase/query';

export type RevenueGoal = {
  readonly goalMinor: string | null;
  readonly goalUsdt: string | null;
  readonly needsMigration: boolean;
};

export type GoalScope = {
  readonly role: 'owner' | 'reseller';
  readonly tenantId: string | null;
};

const EMPTY: RevenueGoal = { goalMinor: null, goalUsdt: null, needsMigration: false };
const MIGRATION: RevenueGoal = { goalMinor: null, goalUsdt: null, needsMigration: true };

function missingColumn(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = error.message.toLowerCase();
  return error.code === '42703' || error.code === '42P01' || message.includes('does not exist') || message.includes('schema cache');
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

function present(minor: string | null): RevenueGoal {
  if (!minor) return EMPTY;
  try {
    const parsed = BigInt(minor);
    if (parsed < 0n) return EMPTY;
    return { goalMinor: parsed.toString(), goalUsdt: minorToUsdt(parsed), needsMigration: false };
  } catch {
    return EMPTY;
  }
}

/**
 * Parses a USDT goal. Zero is allowed. More than 6 decimal places is rejected.
 */
export function parseGoalUsdt(raw: unknown): bigint {
  const value = typeof raw === 'number' && Number.isFinite(raw) ? raw.toString() : typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    throw new ValidationError('INVALID_GOAL', 'Enter the revenue goal in USDT.');
  }
  const minor = usdtToMinor(value);
  if (minor < 0n) {
    throw new ValidationError('INVALID_GOAL', 'The revenue goal must be zero or more.');
  }
  return minor;
}

async function readRow(db: DbClient, scope: GoalScope): Promise<QueryResult<unknown>> {
  if (scope.role === 'reseller') {
    if (!scope.tenantId) {
      throw new AppError('GOAL_SCOPE', 'This store has no tenant.', 403);
    }
    return (await db.from('tenant_settings').select('id, revenue_goal_minor').eq('tenant_id', scope.tenantId).maybeSingle()) as QueryResult<unknown>;
  }
  return (await db.from('platform_settings').select('id, revenue_goal_minor').limit(1).maybeSingle()) as QueryResult<unknown>;
}

export async function readRevenueGoal(db: DbClient, scope: GoalScope): Promise<RevenueGoal> {
  const result = await readRow(db, scope);
  if (result.error) {
    if (missingColumn(result.error)) return MIGRATION;
    throw new AppError('GOAL_READ_FAILED', result.error.message, 500);
  }
  if (!result.data || typeof result.data !== 'object') return EMPTY;
  const minor = text((result.data as Record<string, unknown>).revenue_goal_minor);
  return present(minor || null);
}

export async function writeRevenueGoal(db: DbClient, scope: GoalScope, minor: bigint): Promise<RevenueGoal> {
  if (minor < 0n) {
    throw new ValidationError('INVALID_GOAL', 'The revenue goal must be zero or more.');
  }
  const current = await readRow(db, scope);
  if (current.error) {
    if (missingColumn(current.error)) return MIGRATION;
    throw new AppError('GOAL_READ_FAILED', current.error.message, 500);
  }
  const patch = { revenue_goal_minor: minor.toString(), updated_at: new Date().toISOString() };
  if (scope.role === 'reseller') {
    const row = current.data && typeof current.data === 'object' ? (current.data as Record<string, unknown>) : null;
    const id = text(row?.id);
    const saved = id
      ? ((await db.from('tenant_settings').update(patch).eq('id', id).select('revenue_goal_minor').maybeSingle()) as QueryResult<unknown>)
      : ((await db.from('tenant_settings').insert({ tenant_id: scope.tenantId, ...patch }).select('revenue_goal_minor').maybeSingle()) as QueryResult<unknown>);
    if (saved.error) {
      if (missingColumn(saved.error)) return MIGRATION;
      throw new AppError('GOAL_WRITE_FAILED', saved.error.message, 500);
    }
    return present(minor.toString());
  }
  const row = current.data && typeof current.data === 'object' ? (current.data as Record<string, unknown>) : null;
  const id = text(row?.id);
  if (!id) {
    throw new AppError('GOAL_WRITE_FAILED', 'The owner store settings row is missing.', 500);
  }
  const saved = (await db.from('platform_settings').update(patch).eq('id', id).select('revenue_goal_minor').maybeSingle()) as QueryResult<unknown>;
  if (saved.error) {
    if (missingColumn(saved.error)) return MIGRATION;
    throw new AppError('GOAL_WRITE_FAILED', saved.error.message, 500);
  }
  return present(minor.toString());
}
