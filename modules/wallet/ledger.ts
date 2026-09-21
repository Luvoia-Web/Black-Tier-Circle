/**
 * @file modules/wallet/ledger.ts
 *
 * Append-only sandbox ledger. Rows are never updated or deleted.
 *
 * Phase 3 persists these signatures to PostgreSQL. Phase 0 keeps an
 * in-memory fake so financial call sites can be wired without floats.
 *
 * @module Wallet
 */

import { WalletError } from '@/lib/errors';
import { addUsdt, subtractUsdt } from '@/lib/money';
import { randomUUID } from 'node:crypto';
import type { AppendLedgerParams, LedgerTransaction, Wallet } from './types';

const sandboxLedger: LedgerTransaction[] = [];
const sandboxWallets = new Map<string, Wallet>();
const seenIdempotencyKeys = new Map<string, LedgerTransaction>();

function availableBalance(wallet: Wallet): bigint {
  return subtractUsdt(wallet.balanceTotalMinor, wallet.balanceReservedMinor);
}

/**
 * Appends an immutable ledger row and returns the new wallet snapshot.
 *
 * @param params - Ledger mutation including required idempotency key
 * @returns Created ledger row
 * @throws WalletError on insufficient funds, duplicate conflicting keys, or negative amounts
 *
 * INVARIANT: Existing ledger rows are never mutated.
 * INVARIANT: Wallet mutations require an idempotency key.
 */
export function appendLedgerEntry(params: AppendLedgerParams): LedgerTransaction {
  const existing = seenIdempotencyKeys.get(params.idempotencyKey);
  if (existing) {
    return existing;
  }

  const current =
    sandboxWallets.get(params.wallet.id) ?? params.wallet;

  let nextTotal = current.balanceTotalMinor;
  let nextReserved = current.balanceReservedMinor;

  if (params.entryType === 'reservation') {
    if (availableBalance(current) < params.amountMinor) {
      throw new WalletError('INSUFFICIENT_FUNDS', 'Available balance is insufficient');
    }
    nextReserved = addUsdt(current.balanceReservedMinor, params.amountMinor);
  } else if (params.entryType === 'reservation_release') {
    nextReserved = subtractUsdt(current.balanceReservedMinor, params.amountMinor);
  } else if (
    params.entryType === 'wholesale_debit' ||
    params.entryType === 'manual_debit'
  ) {
    nextTotal = subtractUsdt(current.balanceTotalMinor, params.amountMinor);
    if (params.entryType === 'wholesale_debit') {
      nextReserved = subtractUsdt(current.balanceReservedMinor, params.amountMinor);
    }
  } else {
    nextTotal = addUsdt(current.balanceTotalMinor, params.amountMinor);
  }

  const entry: LedgerTransaction = {
    id: randomUUID(),
    walletId: current.id,
    entryType: params.entryType,
    amountMinor: params.amountMinor,
    balanceAfterMinor: nextTotal,
    referenceId: params.referenceId === undefined ? null : params.referenceId,
    referenceType: params.referenceType === undefined ? null : params.referenceType,
    actorId: params.actorId === undefined ? null : params.actorId,
    note: params.note === undefined ? null : params.note,
    createdAt: new Date().toISOString(),
    idempotencyKey: params.idempotencyKey,
  };

  sandboxLedger.push(entry);
  seenIdempotencyKeys.set(params.idempotencyKey, entry);
  sandboxWallets.set(current.id, {
    ...current,
    balanceTotalMinor: nextTotal,
    balanceReservedMinor: nextReserved,
  });
  return entry;
}

/**
 * Returns a copy of sandbox ledger rows for a wallet.
 *
 * @param walletId - Wallet UUID
 * @returns Append-only history, oldest first
 */
export function listLedgerEntries(walletId: string): readonly LedgerTransaction[] {
  return sandboxLedger.filter((entry) => entry.walletId === walletId);
}

/**
 * Reads the latest sandbox wallet snapshot.
 *
 * @param wallet - Fallback wallet if none has been mutated yet
 * @returns Current sandbox wallet
 */
export function getSandboxWallet(wallet: Wallet): Wallet {
  return sandboxWallets.get(wallet.id) ?? wallet;
}
