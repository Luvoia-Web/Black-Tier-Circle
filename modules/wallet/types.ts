/**
 * @file modules/wallet/types.ts
 *
 * Wallet and ledger types. All amounts are USDT minor units.
 *
 * @module Wallet
 */

export type LedgerEntryType =
  | 'top_up_credit'
  | 'manual_credit'
  | 'manual_debit'
  | 'reservation'
  | 'reservation_release'
  | 'wholesale_debit'
  | 'wholesale_reversal'
  | 'adjustment';

export type Wallet = {
  readonly id: string;
  readonly tenantId: string;
  readonly balanceTotalMinor: bigint;
  readonly balanceReservedMinor: bigint;
};

export type LedgerTransaction = {
  readonly id: string;
  readonly walletId: string;
  readonly entryType: LedgerEntryType;
  readonly amountMinor: bigint;
  readonly balanceAfterMinor: bigint;
  readonly referenceId: string | null;
  readonly referenceType: string | null;
  readonly actorId: string | null;
  readonly note: string | null;
  readonly createdAt: string;
  readonly idempotencyKey: string;
};

export type AppendLedgerParams = {
  readonly wallet: Wallet;
  readonly entryType: LedgerEntryType;
  readonly amountMinor: bigint;
  readonly referenceId?: string;
  readonly referenceType?: string;
  readonly actorId?: string;
  readonly note?: string;
  readonly idempotencyKey: string;
};
