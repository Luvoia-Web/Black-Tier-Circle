/**
 * @file modules/wallet/ledger.ts
 *
 * Append-only ledger read operations.
 * Write operations go through Postgres functions only (modules/wallet/index.ts).
 *
 * INVARIANT: This file contains NO INSERT, UPDATE, or DELETE operations.
 * All writes go through supabase.rpc() calls in index.ts.
 *
 * @module Wallet
 */

import { AppError, NotFoundError } from '@/lib/errors';
import type { DbClient, QueryBuilder, QueryResult } from '@/lib/supabase/query';
import { mapLedgerRow, mapWalletRow } from './map';
import type { LedgerEntry, LedgerListOptions, LedgerRow, WalletRow, WalletStatement } from './types';

function asLedgerRow(data: unknown): LedgerRow {
  return data as LedgerRow;
}

function asWalletRow(data: unknown): WalletRow {
  return data as WalletRow;
}

/**
 * Returns ledger entries for a wallet, newest first.
 * SECURITY: caller must verify wallet belongs to their tenant before calling.
 *
 * @param supabase - Database client
 * @param walletId - Wallet UUID
 * @param options - Pagination and date filters
 */
export async function getLedgerEntries(
  supabase: DbClient,
  walletId: string,
  options?: LedgerListOptions,
): Promise<LedgerEntry[]> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  let query: QueryBuilder<unknown> = supabase
    .from('ledger_transactions')
    .select('*')
    .eq('wallet_id', walletId)
    .order('created_at', { ascending: false });

  if (options?.since !== undefined) {
    query = query.gte('created_at', options.since.toISOString());
  }
  if (options?.until !== undefined) {
    query = query.lte('created_at', options.until.toISOString());
  }

  const result = (await query.range(offset, offset + limit - 1)) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('LEDGER_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((row) => mapLedgerRow(asLedgerRow(row)));
}

/**
 * Returns wallet plus ledger entries and computed credit/debit totals for a period.
 *
 * @param supabase - Database client
 * @param walletId - Wallet UUID
 * @param periodStart - Inclusive start
 * @param periodEnd - Inclusive end
 */
export async function getWalletStatement(
  supabase: DbClient,
  walletId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<WalletStatement> {
  const walletResult = await supabase.from('wallets').select('*').eq('id', walletId).maybeSingle();
  if (walletResult.error) {
    throw new AppError('WALLET_LOOKUP_FAILED', walletResult.error.message, 500);
  }
  if (walletResult.data === null) {
    throw new NotFoundError('Wallet');
  }
  const wallet = mapWalletRow(asWalletRow(walletResult.data));
  const entries = await getLedgerEntries(supabase, walletId, {
    limit: 10_000,
    offset: 0,
    since: periodStart,
    until: periodEnd,
  });

  let totalCredits = 0n;
  let totalDebits = 0n;
  for (const entry of entries) {
    if (entry.amount > 0n) {
      totalCredits += entry.amount;
    } else if (entry.amount < 0n) {
      totalDebits += -entry.amount;
    }
  }

  return {
    wallet,
    entries,
    totalCredits,
    totalDebits,
    periodStart,
    periodEnd,
  };
}

/**
 * Returns current balance_total from the wallets table.
 * Used to verify ledger integrity (should match last ledger entry's balance_after).
 *
 * @param supabase - Database client
 * @param walletId - Wallet UUID
 */
export async function getRunningBalance(supabase: DbClient, walletId: string): Promise<bigint> {
  const { data, error } = await supabase.from('wallets').select('*').eq('id', walletId).maybeSingle();
  if (error) {
    throw new AppError('WALLET_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null) {
    throw new NotFoundError('Wallet');
  }
  return mapWalletRow(asWalletRow(data)).balanceTotal;
}
