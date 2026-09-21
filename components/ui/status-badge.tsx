/**
 * @file components/ui/status-badge.tsx
 *
 * Colored badge for pending, active, and suspended account states.
 *
 * @module Components
 */

import type { AccountStatus } from '@/modules/identity/types';

type StatusBadgeProps = {
  readonly status: AccountStatus;
};

const STYLES: Record<AccountStatus, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400',
  active: 'bg-emerald-500/10 text-emerald-400',
  suspended: 'bg-red-500/10 text-red-400',
};

/**
 * Renders a status pill for tenant and profile states.
 *
 * @param props - Account status
 */
export function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STYLES[status]}`}>
      {status}
    </span>
  );
}
