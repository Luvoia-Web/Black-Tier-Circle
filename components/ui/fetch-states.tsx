/**
 * @file components/ui/fetch-states.tsx
 *
 * Shared loading skeleton, error retry, and empty states.
 *
 * @module Components
 */

type SkeletonProps = {
  readonly rows?: number;
};

export function TableSkeleton({ rows = 5 }: SkeletonProps): JSX.Element {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton h-10" />
      ))}
    </div>
  );
}

type ErrorStateProps = {
  readonly message: string;
  readonly onRetry: () => void;
};

export function ErrorState({ message, onRetry }: ErrorStateProps): JSX.Element {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--red)]/20 bg-[var(--red-soft)] px-6 py-8 text-center">
      <p className="text-sm text-[var(--red)]">{message}</p>
      <button type="button" onClick={onRetry} className="btc-btn-primary mt-3">
        Retry
      </button>
    </div>
  );
}

type EmptyStateProps = {
  readonly message: string;
};

export function EmptyState({ message }: EmptyStateProps): JSX.Element {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-12 text-center text-sm text-[var(--text-2)]">
      {message}
    </div>
  );
}
