/**
 * @file components/catalog/product-status-badge.tsx
 *
 * Status pill for catalog product lifecycle states.
 *
 * @module Components
 */

import type { ProductStatus } from '@/modules/catalog/types';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';

type ProductStatusBadgeProps = {
  readonly status: ProductStatus;
};

const VARIANT: Record<ProductStatus, BadgeVariant> = {
  draft: 'neutral',
  published: 'success',
  paused: 'warning',
  archived: 'danger',
};

/**
 * Renders a product status pill.
 *
 * @param props - Product status
 */
export function ProductStatusBadge({ status }: ProductStatusBadgeProps): JSX.Element {
  return <Badge variant={VARIANT[status]}>{status}</Badge>;
}
