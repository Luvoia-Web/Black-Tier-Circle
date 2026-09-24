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

export function EmptyState({ icon, title, description, action }: EmptyStateProps): JSX.Element {
  const decorative = icon && !/\p{Extended_Pictographic}/u.test(icon) ? icon : null;
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg-raised)] text-[var(--text-2)]" aria-hidden>
        {decorative ?? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
          </svg>
        )}
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
