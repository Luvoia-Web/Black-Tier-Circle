/**
 * @file components/orders/track-badge.tsx
 *
 * Status pills for the four independent order tracks.
 *
 * @module Components
 */

function classFor(status: string): string {
  if (
    status === 'verified' ||
    status === 'ready' ||
    status === 'sent' ||
    status === 'debited' ||
    status === 'success'
  ) {
    return 'bg-emerald-500/10 text-emerald-400';
  }
  if (
    status === 'failed' ||
    status === 'unreachable' ||
    status === 'canceled' ||
    status === 'expired'
  ) {
    return 'bg-red-500/10 text-red-400';
  }
  if (
    status === 'manual_pending' ||
    status === 'pending_verification' ||
    status === 'retry_pending' ||
    status === 'queued' ||
    status === 'awaiting'
  ) {
    return 'bg-yellow-500/10 text-yellow-400';
  }
  return 'bg-gray-500/10 text-gray-300';
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
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${classFor(status)}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}
