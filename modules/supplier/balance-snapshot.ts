/**
 * Writes one supplier balance reading into supplier_balance_snapshots.
 */

import type { DbClient, QueryResult } from '@/lib/supabase/query';

export async function recordBalanceSnapshot(
  db: DbClient,
  supplierId: string,
  balance: number,
): Promise<'saved' | 'failed'> {
  if (!supplierId || !Number.isFinite(balance)) return 'failed';
  const saved = (await db.from('supplier_balance_snapshots').insert({
    supplier_id: supplierId,
    balance_usdt: balance,
  })) as QueryResult<unknown>;
  if (saved.error) return 'failed';
  return 'saved';
}
