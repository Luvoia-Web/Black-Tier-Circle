/**
 * @file components/wallet/ledger-badges.tsx
 *
 * Status and ledger-type badges for wallet UIs.
 *
 * @module Components
 */

import type { LedgerEntryType, TokenStatus } from '@/modules/wallet/types';

const TOKEN_STYLES: Record<TokenStatus, string> = {
  active: 'bg-emerald-500/10 text-emerald-400',
  redeemed: 'bg-gray-500/10 text-gray-300',
  expired: 'bg-yellow-500/10 text-yellow-400',
  revoked: 'bg-red-500/10 text-red-400',
};

const TYPE_LABELS: Record<LedgerEntryType, string> = {
  top_up_credit: 'Top-up',
  manual_credit: 'Manual credit',
  manual_debit: 'Manual debit',
  reservation: 'Reservation',
  reservation_release: 'Reservation release',
  wholesale_debit: 'Wholesale debit',
  wholesale_reversal: 'Wholesale reversal',
  adjustment: 'Adjustment',
};

/**
 * Renders a top-up token status pill.
 */
export function TokenStatusBadge({ status }: { readonly status: TokenStatus }): JSX.Element {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${TOKEN_STYLES[status]}`}>
      {status}
    </span>
  );
}

/**
 * Human-readable ledger entry type.
 */
export function ledgerTypeLabel(type: LedgerEntryType): string {
  return TYPE_LABELS[type];
}

/**
 * Amount color: credits green, debits red, reservations grey.
 */
export function amountClassName(type: LedgerEntryType, amount: bigint): string {
  if (type === 'reservation' || type === 'reservation_release' || amount === 0n) {
    return 'text-gray-400';
  }
  if (amount < 0n) {
    return 'text-red-400';
  }
  return 'text-emerald-400';
}
