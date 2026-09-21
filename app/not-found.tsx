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
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 bg-gray-950 p-8 text-gray-100">
      <p className="text-sm text-indigo-400">404</p>
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="text-gray-400">The page you requested does not exist.</p>
      <Link
        href={ROUTES.home}
        className="w-fit rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        Back to home
      </Link>
    </main>
  );
}
