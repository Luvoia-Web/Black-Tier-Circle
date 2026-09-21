/**
 * @file app/(dashboard)/reseller/settings/page.tsx
 *
 * Reseller settings with links to API keys and webhooks.
 *
 * @module Dashboard
 */

import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { ROUTES } from '@/lib/navigation';

export default function ResellerSettingsPage(): JSX.Element {
  return (
    <>
      <PageHeader title="Settings" description="Integration settings for the public reseller API." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href={ROUTES.reseller.settingsApiKeys}
          className="rounded-lg border border-gray-800 bg-gray-900 p-5 hover:border-indigo-500"
        >
          <h2 className="text-lg font-medium text-gray-100">API keys</h2>
          <p className="mt-2 text-sm text-gray-400">Issue and revoke keys for /api/v1/.</p>
        </Link>
        <Link
          href={ROUTES.reseller.settingsWebhooks}
          className="rounded-lg border border-gray-800 bg-gray-900 p-5 hover:border-indigo-500"
        >
          <h2 className="text-lg font-medium text-gray-100">Webhooks</h2>
          <p className="mt-2 text-sm text-gray-400">Receive signed order event callbacks.</p>
        </Link>
        <Link
          href={ROUTES.public.apiDocs}
          className="rounded-lg border border-gray-800 bg-gray-900 p-5 hover:border-indigo-500"
        >
          <h2 className="text-lg font-medium text-gray-100">API documentation</h2>
          <p className="mt-2 text-sm text-gray-400">Public reference for v1 endpoints.</p>
        </Link>
      </div>
    </>
  );
}
