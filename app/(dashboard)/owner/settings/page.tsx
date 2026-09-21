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
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-6 py-8 text-sm text-gray-400">
          Branding, notification, and payment-live switches ship in Phase 9.
        </div>
        <Link
          href={ROUTES.public.apiDocs}
          className="inline-flex rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Open API documentation
        </Link>
      </div>
    </>
  );
}
