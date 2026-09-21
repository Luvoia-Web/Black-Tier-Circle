/**
 * @file modules/wallet/index.ts
 *
 * Wallet public API wrapping the append-only sandbox ledger.
 *
 * @module Wallet
 */

import { WalletError } from '@/lib/errors';
import { appendLedgerEntry, getSandboxWallet } from './ledger';
import type { Wallet } from './types';

export type { AppendLedgerParams, LedgerEntryType, LedgerTransaction, Wallet } from './types';
export { appendLedgerEntry, getSandboxWallet, listLedgerEntries } from './ledger';

/**
 * Credits a wallet with a top-up or manual credit.
 *
 * @param wallet - Wallet to credit
 * @param amountMinor - Amount in USDT minor units
 * @param idempotencyKey - Caller-supplied idempotency key
 * @param entryType - Credit entry type
 * @returns Updated wallet snapshot
 */
export function creditWallet(
  wallet: Wallet,
  amountMinor: bigint,
  idempotencyKey: string,
  entryType: 'top_up_credit' | 'manual_credit' | 'adjustment' = 'top_up_credit',
): Wallet {
  if (amountMinor <= 0n) {
    throw new WalletError('INVALID_AMOUNT', 'Credit amount must be greater than zero');
  }
  appendLedgerEntry({
    wallet,
    entryType,
    amountMinor,
    idempotencyKey,
  });
  return getSandboxWallet(wallet);
}

/**
 * Debits wholesale cost from a wallet after a reservation.
 *
 * @param wallet - Wallet to debit
 * @param amountMinor - Amount in USDT minor units
 * @param idempotencyKey - Caller-supplied idempotency key
 * @returns Updated wallet snapshot
 */
export function debitWallet(wallet: Wallet, amountMinor: bigint, idempotencyKey: string): Wallet {
  if (amountMinor <= 0n) {
    throw new WalletError('INVALID_AMOUNT', 'Debit amount must be greater than zero');
  }
  appendLedgerEntry({
    wallet,
    entryType: 'wholesale_debit',
    amountMinor,
    idempotencyKey,
  });
  return getSandboxWallet(wallet);
}
