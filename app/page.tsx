/**
 * @file app/page.tsx
 *
 * Public landing entry that points operators at login.
 *
 * @module App
 */

import Link from 'next/link';
import { ROUTES } from '@/lib/navigation';

export default function HomePage(): JSX.Element {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 bg-gray-950 p-8 text-gray-100">
      <h1 className="text-3xl font-semibold">Black Tier Circle</h1>
      <p className="text-gray-400">Multi-tenant operations platform for owner and reseller dashboards.</p>
      <Link
        href={ROUTES.login}
        className="w-fit rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        Sign in
      </Link>
    </main>
  );
}
