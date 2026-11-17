/**
 * @file components/platform/ui/feedback.tsx
 *
 * Loading, failure, and the next action when a list is empty.
 */

import type { ReactNode } from 'react';
import { Button } from '@/components/platform/ui/button';

type SkeletonProps = {
  readonly className?: string;
};

export function Skeleton({ className = 'h-4 w-full' }: SkeletonProps): JSX.Element {
  return <span aria-hidden="true" className={`block rounded-md bg-raised ${className}`} />;
}

type ErrorStateProps = {
  readonly title?: string;
  readonly message: string;
  readonly onRetry?: () => void;
};

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps): JSX.Element {
  return (
    <div role="alert" className="rounded-lg border border-[var(--fault)] bg-[var(--fault-tint)] px-4 py-4">
      <p className="text-sm text-ink">{title}</p>
      <p className="mt-1 text-sm" style={{ color: 'var(--fault-ink)' }}>{message}</p>
      {onRetry ? (
        <div className="mt-3">
          <Button variant="secondary" onClick={onRetry}>Try again</Button>
        </div>
      ) : null}
    </div>
  );
}

type EmptyStateProps = {
  readonly title: string;
  readonly message: string;
  readonly action?: ReactNode;
};

export function EmptyState({ title, message, action }: EmptyStateProps): JSX.Element {
  return (
    <div className="rounded-lg border border-dashed border-stroke px-4 py-8 text-center">
      <p className="text-sm text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{message}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
