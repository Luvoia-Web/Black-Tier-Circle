/**
 * @file app/error.tsx
 *
 * App Router error boundary. Never renders stack traces.
 *
 * @module App
 */

'use client';

type ErrorPageProps = {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
};

/**
 * Generic error page for unexpected render failures.
 */
export default function ErrorPage({ reset }: ErrorPageProps): JSX.Element {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 bg-gray-950 p-8 text-gray-100">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="text-gray-400">An unexpected error occurred. Try again, or return later if it persists.</p>
      <button
        type="button"
        onClick={reset}
        className="w-fit rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        Try again
      </button>
    </main>
  );
}
