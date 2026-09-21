/**
 * @file app/not-found.tsx
 *
 * Dark-theme 404 page.
 *
 * @module App
 */

import Link from 'next/link';
import { ROUTES } from '@/lib/navigation';

export default function NotFound(): JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg-page)] p-8 text-center">
      <p className="text-8xl font-black text-[var(--text-3)]">404</p>
      <h1 className="text-xl font-semibold text-[var(--text-1)]">Page not found</h1>
      <p className="max-w-sm text-sm text-[var(--text-2)]">The page you requested does not exist.</p>
      <Link href={ROUTES.home} className="btc-btn-primary">
        Go to Dashboard
      </Link>
    </main>
  );
}
