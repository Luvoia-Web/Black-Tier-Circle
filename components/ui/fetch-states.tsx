/**
 * @file components/ui/fetch-states.tsx
 *
 * Shared loading skeleton, error retry, and empty states.
 *
 * @module Components
 */

import { PageError } from '@/components/ui/PageError';
import { SkeletonPage, SkeletonTable } from '@/components/ui/Skeleton';
import { EmptyState as RichEmptyState } from '@/components/ui/EmptyState';

export { SkeletonPage, SkeletonTable, SkeletonTable as TableSkeleton };

type ErrorStateProps = {
  readonly message: string;
  readonly onRetry: () => void;
};

export function ErrorState({ message, onRetry }: ErrorStateProps): JSX.Element {
  return <PageError message={message} onRetry={onRetry} />;
}

type EmptyStateProps = {
  readonly message: string;
  readonly icon?: string;
  readonly title?: string;
  readonly action?: { readonly label: string; readonly href?: string; readonly onClick?: () => void };
};

export function EmptyState({ message, icon, title, action }: EmptyStateProps): JSX.Element {
  if (title) {
    return (
      <RichEmptyState
        {...(icon ? { icon } : {})}
        title={title}
        description={message}
        {...(action ? { action } : {})}
      />
    );
  }
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-12 text-center text-sm text-[var(--text-2)]">
      {message}
    </div>
  );
}
