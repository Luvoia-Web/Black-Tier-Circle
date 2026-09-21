/**
 * @file components/ui/page-header.tsx
 *
 * Page title with an optional action slot.
 *
 * @module Components
 */

import type { ReactNode } from 'react';

type PageHeaderProps = {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
};

/**
 * Renders a dashboard page heading row.
 *
 * @param props - Title, optional description, optional actions
 */
export function PageHeader({ title, description, actions }: PageHeaderProps): JSX.Element {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">{title}</h1>
        {description ? <p className="mt-1 text-sm text-gray-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
