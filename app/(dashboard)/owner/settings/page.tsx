/**
 * @file app/(dashboard)/owner/settings/page.tsx
 *
 * Owner settings stubs plus a link to public API documentation.
 *
 * @module Dashboard
 */

import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { ROUTES } from '@/lib/navigation';

export default function OwnerSettingsPage(): JSX.Element {
  return (
    <>
      <PageHeader title="Settings" description="Platform settings (Phase 9) and developer resources." />
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-6 py-8 text-sm text-[var(--text-2)]">
          Branding, notification, and payment-live switches ship in Phase 9.
        </div>
        <Link
          href={ROUTES.public.apiDocs}
          className="inline-flex rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-soft)]"
        >
          Open API documentation
        </Link>
      </div>
    </>
  );
}
