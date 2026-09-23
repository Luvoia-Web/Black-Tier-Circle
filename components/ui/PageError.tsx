/**
 * @file components/ui/PageError.tsx
 *
 * Retryable page-level error state.
 *
 * @module Components
 */

type PageErrorProps = {
  readonly message?: string;
  readonly onRetry?: () => void;
};

export function PageError({ message = 'Failed to load data', onRetry }: PageErrorProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 text-4xl" aria-hidden>
        ⚠️
      </div>
      <h3 className="mb-2 text-base font-medium text-[var(--text-1)]">{message}</h3>
      <p className="mb-6 text-sm text-[var(--text-2)]">This might be a temporary issue. Please try again.</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-[var(--border-soft)] bg-[var(--bg-raised)] px-4 py-2 text-sm text-[var(--text-1)] transition-colors hover:border-[var(--accent)]"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
