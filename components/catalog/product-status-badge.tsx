/**
 * @file components/catalog/product-status-badge.tsx
 *
 * Status pill for catalog product lifecycle states.
 *
 * @module Components
 */

import type { ProductStatus } from '@/modules/catalog/types';

type ProductStatusBadgeProps = {
  readonly status: ProductStatus;
};

const STYLES: Record<ProductStatus, string> = {
  draft: 'bg-gray-500/10 text-gray-300',
  published: 'bg-emerald-500/10 text-emerald-400',
  paused: 'bg-yellow-500/10 text-yellow-400',
  archived: 'bg-red-500/10 text-red-400',
};

/**
 * Renders a product status pill.
 *
 * @param props - Product status
 */
export function ProductStatusBadge({ status }: ProductStatusBadgeProps): JSX.Element {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STYLES[status]}`}>
      {status}
    </span>
  );
}
