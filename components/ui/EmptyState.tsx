/**
 * @file components/ui/EmptyState.tsx
 *
 * Action-oriented empty state for dashboard lists.
 *
 * @module Components
 */

import Link from 'next/link';

type EmptyStateProps = {
  readonly icon?: string;
  readonly title: string;
  readonly description: string;
  readonly action?: { readonly label: string; readonly href?: string; readonly onClick?: () => void };
};

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
      <div className="mb-3 text-3xl" aria-hidden>
        {icon}
      </div>
      <h3 className="text-base font-medium text-[var(--text-1)]">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-[var(--text-2)]">{description}</p>
      {action?.href ? (
        <Link href={action.href} className="btc-btn-primary mt-6">
          {action.label}
        </Link>
      ) : null}
      {action?.onClick ? (
        <button type="button" onClick={action.onClick} className="btc-btn-primary mt-6">
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
