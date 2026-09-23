/**
 * @file modules/wallet/types.ts
 *
 * Type definitions for the wallet and ledger system.
 * All amounts are in USDT minor units (bigint × 10^6).
 * INVARIANT: balanceTotal >= balanceReserved >= 0 always.
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

export type TokenStatus = 'active' | 'redeemed' | 'expired' | 'revoked';

export type ReservationStatus = 'active' | 'consumed' | 'released';

export type Wallet = {
  readonly id: string;
  readonly tenantId: string;
  /** Total balance including reserved funds. In USDT minor units. */
  readonly balanceTotal: bigint;
  /** Funds held for pending orders. In USDT minor units. */
  readonly balanceReserved: bigint;
  /** Available to spend = balanceTotal - balanceReserved */
  readonly balanceAvailable: bigint;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type LedgerEntry = {
  readonly id: string;
  readonly walletId: string;
  readonly entryType: LedgerEntryType;
  /** Positive = credit, negative = debit. In USDT minor units. */
  readonly amount: bigint;
  /** Running wallet total after this entry. In USDT minor units. */
  readonly balanceAfter: bigint;
  readonly referenceId: string | null;
  readonly referenceType: string | null;
  readonly actorId: string | null;
  readonly note: string | null;
  readonly createdAt: Date;
};

export type WalletReservation = {
  readonly id: string;
  readonly walletId: string;
  readonly orderId: string;
  /** Amount reserved. In USDT minor units. */
  readonly amount: bigint;
  readonly status: ReservationStatus;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type TopupToken = {
  readonly id: string;
  readonly token: string;
  /** Amount this token credits. In USDT minor units. */
  readonly amountUsdt: bigint;
  readonly status: TokenStatus;
  readonly tenantId: string | null;
  readonly createdBy: string;
  readonly redeemedBy: string | null;
  readonly redeemedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
};

export type CreateTopupTokenInput = {
  /** Amount in USDT minor units */
  readonly amountUsdt: bigint;
  /** Optional: restrict to a specific tenant. Null = any reseller. */
  readonly tenantId?: string;
  /** Optional: expiry. Null = never expires. */
  readonly expiresAt?: Date;
};

export type RedeemTokenResult = {
  readonly success: boolean;
  readonly amountCredited?: bigint;
  readonly newBalance?: bigint;
  readonly errorCode?: string;
  /** Set when the token funds a reseller store wallet instead of customer credit. */
  readonly storeTenantId?: string;
};

export type WalletStatement = {
  readonly wallet: Wallet;
  readonly entries: LedgerEntry[];
  readonly totalCredits: bigint;
  readonly totalDebits: bigint;
  readonly periodStart: Date;
  readonly periodEnd: Date;
};

export type AdminWalletListItem = {
  readonly walletId: string;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly resellerName: string;
  readonly balanceTotal: bigint;
  readonly balanceReserved: bigint;
  readonly balanceAvailable: bigint;
  readonly lastActivityAt: Date;
};

export type WalletRow = {
  readonly id: string;
  readonly tenant_id: string;
  readonly balance_total: string | number | bigint;
  readonly balance_reserved: string | number | bigint;
  readonly created_at: string;
  readonly updated_at: string;
};

export type LedgerRow = {
  readonly id: string;
  readonly wallet_id: string;
  readonly entry_type: LedgerEntryType;
  readonly amount: string | number | bigint;
  readonly balance_after: string | number | bigint;
  readonly reference_id: string | null;
  readonly reference_type: string | null;
  readonly actor_id: string | null;
  readonly note: string | null;
  readonly created_at: string;
};

export type TopupTokenRow = {
  readonly id: string;
  readonly token: string;
  readonly amount_usdt: string | number | bigint;
  readonly status: TokenStatus;
  readonly tenant_id: string | null;
  readonly created_by: string;
  readonly redeemed_by: string | null;
  readonly redeemed_at: string | null;
  readonly expires_at: string | null;
  readonly created_at: string;
};

export type LedgerListOptions = {
  readonly limit?: number;
  readonly offset?: number;
  readonly since?: Date;
  readonly until?: Date;
};
