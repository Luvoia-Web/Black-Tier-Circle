/**
 * @file modules/wallet/map.ts
 *
 * Maps wallet, ledger, and token database rows to domain types.
 *
 * @module Wallet
 */

import type { LedgerEntry, LedgerRow, TopupToken, TopupTokenRow, Wallet, WalletRow } from './types';

/**
 * Converts a database numeric/bigint value into USDT minor units.
 * Never uses Number() — amounts stay exact.
 *
 * @param value - Driver-returned integer
 */
export function asMinorUnits(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  return BigInt(value);
}

/**
 * Masks a 12-digit token for list views. Full value is only returned at creation.
 *
 * @param token - Stored token
 */
export function maskTopupToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length < 4) {
    return '****';
  }
  return `${trimmed.slice(0, 4)}****`;
}

/**
 * Maps a wallets table row and computes available balance.
 *
 * @param row - Database row
 */
export function mapWalletRow(row: WalletRow): Wallet {
  const balanceTotal = asMinorUnits(row.balance_total);
  const balanceReserved = asMinorUnits(row.balance_reserved);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    balanceTotal,
    balanceReserved,
    balanceAvailable: balanceTotal - balanceReserved,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Maps a ledger_transactions row. Ledger rows are immutable.
 *
 * @param row - Database row
 */
export function mapLedgerRow(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    walletId: row.wallet_id,
    entryType: row.entry_type,
    amount: asMinorUnits(row.amount),
    balanceAfter: asMinorUnits(row.balance_after),
    referenceId: row.reference_id,
    referenceType: row.reference_type,
    actorId: row.actor_id,
    note: row.note,
    createdAt: new Date(row.created_at),
  };
}

/**
 * Maps a topup_tokens row. Caller decides whether to mask `token`.
 *
 * @param row - Database row
 */
export function mapTopupTokenRow(row: TopupTokenRow): TopupToken {
  return {
    id: row.id,
    token: row.token.trim(),
    amountUsdt: asMinorUnits(row.amount_usdt),
    status: row.status,
    tenantId: row.tenant_id,
    createdBy: row.created_by,
    redeemedBy: row.redeemed_by,
    redeemedAt: row.redeemed_at === null ? null : new Date(row.redeemed_at),
    expiresAt: row.expires_at === null ? null : new Date(row.expires_at),
    createdAt: new Date(row.created_at),
  };
}

/**
 * Returns a token record safe for list APIs (full token never leaves the server).
 *
 * @param token - Domain token
 */
export function toPublicTopupToken(token: TopupToken): TopupToken {
  return {
    ...token,
    token: maskTopupToken(token.token),
  };
}
