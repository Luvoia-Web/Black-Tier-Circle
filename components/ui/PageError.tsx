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
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--red-soft)] text-[var(--red)]" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M12 8v5M12 16.5h.01" strokeLinecap="round" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </div>
      <h3 className="mb-2 text-base font-medium text-[var(--text-1)]">{message}</h3>
      <p className="mb-6 text-sm text-[var(--text-2)]">This might be a temporary issue. Please try again.</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="btc-btn-secondary"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
