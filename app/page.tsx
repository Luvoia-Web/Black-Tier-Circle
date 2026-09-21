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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bg-page)] p-8 text-center">
      <p className="text-lg font-semibold">◆ Black Tier Circle</p>
      <p className="max-w-md text-sm text-[var(--text-2)]">
        Multi-tenant operations platform for owner and reseller dashboards.
      </p>
      <Link href={ROUTES.login} className="btc-btn-primary">
        Sign in
      </Link>
    </main>
  );
}
