/**
 * @file app/page.tsx
 *
 * Public landing stub for Phase 0.
 *
 * Gives the App Router a root page so the development server has an
 * entry point. Real marketing copy is out of scope for this phase.
 *
 * @module App
 */

import Link from 'next/link';

export default function HomePage(): JSX.Element {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">Black Tier Circle</h1>
      <p className="text-zinc-400">
        Phase 0 foundation is running. Dashboards and auth flows are stubs.
      </p>
      <div className="flex gap-4">
        <Link className="underline" href="/login">
          Login
        </Link>
        <Link className="underline" href="/owner">
          Owner
        </Link>
        <Link className="underline" href="/reseller">
          Reseller
        </Link>
      </div>
    </main>
  );
}
