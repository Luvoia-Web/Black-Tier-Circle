/**
 * Writes one supplier balance reading. Missing table means 0034 is not applied.
 */

import type { DbClient, QueryResult } from '@/lib/supabase/query';

function missing(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = error.message.toLowerCase();
  return error.code === '42P01' || error.code === '42703' || message.includes('does not exist') || message.includes('schema cache');
}

export async function recordBalanceSnapshot(
  db: DbClient,
  supplierId: string,
  balance: number,
): Promise<'saved' | 'needs-migration' | 'failed'> {
  if (!supplierId || !Number.isFinite(balance)) return 'failed';
  const saved = (await db.from('supplier_balance_snapshots').insert({
    supplier_id: supplierId,
    balance_usdt: balance,
  })) as QueryResult<unknown>;
  if (missing(saved.error)) return 'needs-migration';
  if (saved.error) return 'failed';
  return 'saved';
}
