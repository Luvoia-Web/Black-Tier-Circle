/**
 * @file app/error.tsx
 *
 * App Router error boundary. Never renders stack traces.
 *
 * @module App
 */

'use client';

import { useEffect, useMemo } from 'react';

type ErrorPageProps = {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
};

/**
 * Generic error page for unexpected render failures.
 */
export default function ErrorPage({ error, reset }: ErrorPageProps): JSX.Element {
  const correlationId = useMemo(() => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `err-${Date.now()}`;
  }, []);

  useEffect(() => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'black-tier-circle',
        message: 'render error boundary',
        correlationId,
        code: error.digest ?? 'RENDER_ERROR',
      }),
    );
  }, [correlationId, error.digest]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg-page)] p-8 text-center">
      <p className="text-8xl font-black text-[var(--text-3)]">!</p>
      <h1 className="text-xl font-semibold text-[var(--text-1)]">Something went wrong</h1>
      <p className="max-w-sm text-sm text-[var(--text-2)]">
        An unexpected error occurred. Try again, or contact support if it persists.
      </p>
      <p className="text-xs text-[var(--text-3)]">Reference: {correlationId}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btc-btn-primary">
          Try again
        </button>
        <a href="mailto:support@blacktiercircle.com" className="btc-btn-secondary">
          Contact support
        </a>
      </div>
    </main>
  );
}
