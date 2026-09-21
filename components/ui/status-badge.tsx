/**
 * @file components/ui/status-badge.tsx
 *
 * Colored badge for pending, active, and suspended account states.
 *
 * @module Components
 */

import type { AccountStatus } from '@/modules/identity/types';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';

type StatusBadgeProps = {
  readonly status: AccountStatus;
};

const VARIANT: Record<AccountStatus, BadgeVariant> = {
  pending: 'warning',
  active: 'success',
  suspended: 'danger',
};

/**
 * Renders a status pill for tenant and profile states.
 *
 * @param props - Account status
 */
export function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  return <Badge variant={VARIANT[status]}>{status}</Badge>;
}

export default StatusBadge;
