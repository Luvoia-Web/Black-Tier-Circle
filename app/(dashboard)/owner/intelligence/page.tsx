/**
 * @file app/(dashboard)/owner/intelligence/page.tsx
 *
 * Owner Operations Control Tower. Middleware and requireOwner keep this
 * route on the platform owner. The panel reads the platform bank only.
 *
 * @module Dashboard
 */

import { ControlTowerPanel } from '@/components/intelligence/ControlTowerPanel';
import { PageHeader } from '@/components/ui/page-header';
import { requireOwner } from '@/lib/auth/session';
import { AuthError } from '@/lib/errors';
import { ROUTES } from '@/lib/navigation';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Operations Control Tower' };

export default async function OwnerIntelligencePage(): Promise<JSX.Element> {
  try {
    await requireOwner();
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      redirect(error.statusCode === 401 ? ROUTES.login : ROUTES.reseller.home);
    }
    throw error;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Operations Control Tower"
        description="Platform-wide memory intelligence — aggregate view across all stores"
      />
      <ControlTowerPanel />
      <p className="mt-6 max-w-3xl text-xs leading-relaxed text-[var(--text-3)]">
        Customer-level data remains private to each reseller&apos;s store. This view reflects platform and aggregate
        patterns only.
      </p>
    </div>
  );
}
