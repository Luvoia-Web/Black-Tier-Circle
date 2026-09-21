/**
 * @file components/orders/track-badge.tsx
 *
 * Status pills for the four independent order tracks.
 *
 * @module Components
 */

import { Badge, type BadgeVariant } from '@/components/ui/Badge';

function variantFor(status: string): BadgeVariant {
  if (
    status === 'verified' ||
    status === 'ready' ||
    status === 'sent' ||
    status === 'debited' ||
    status === 'success'
  ) {
    return 'success';
  }
  if (status === 'failed' || status === 'unreachable' || status === 'canceled' || status === 'expired') {
    return 'danger';
  }
  if (
    status === 'manual_pending' ||
    status === 'pending_verification' ||
    status === 'retry_pending' ||
    status === 'queued' ||
    status === 'awaiting' ||
    status === 'supplier_pending' ||
    status === 'outcome_unknown'
  ) {
    return 'warning';
  }
  return 'neutral';
}

type TrackBadgeProps = {
  readonly status: string;
};

/**
 * Colored badge for payment, funding, fulfillment, or delivery status.
 *
 * @param props - Status string
 */
export function TrackBadge({ status }: TrackBadgeProps): JSX.Element {
  return <Badge variant={variantFor(status)}>{status.replaceAll('_', ' ')}</Badge>;
}
