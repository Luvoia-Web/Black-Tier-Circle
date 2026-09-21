/**
 * @file components/wallet/ledger-badges.tsx
 *
 * Status and ledger-type badges for wallet UIs.
 *
 * @module Components
 */

import type { LedgerEntryType, TokenStatus } from '@/modules/wallet/types';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';

const TOKEN_VARIANT: Record<TokenStatus, BadgeVariant> = {
  active: 'success',
  redeemed: 'neutral',
  expired: 'warning',
  revoked: 'danger',
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
  return <Badge variant={TOKEN_VARIANT[status]}>{status}</Badge>;
}

/**
 * Human-readable ledger entry type.
 */
export function ledgerTypeLabel(type: LedgerEntryType): string {
  return TYPE_LABELS[type];
}

/**
 * Amount color: credits green, debits red, reservations muted.
 */
export function amountClassName(type: LedgerEntryType, amount: bigint): string {
  if (type === 'reservation' || type === 'reservation_release' || amount === 0n) {
    return 'text-[var(--text-2)]';
  }
  if (amount < 0n) {
    return 'text-[var(--red)]';
  }
  return 'text-[var(--green)]';
}
