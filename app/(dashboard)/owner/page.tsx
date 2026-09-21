/**
 * @file app/(dashboard)/owner/page.tsx
 *
 * Owner dashboard home with placeholder stats and a reseller invite action.
 *
 * @module Dashboard
 */

import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { ROUTES } from '@/lib/navigation';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { asDbClient } from '@/lib/auth/session';
import { getProfile } from '@/modules/identity';
import { redirect } from 'next/navigation';

export default async function OwnerDashboardPage(): Promise<JSX.Element> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    redirect(ROUTES.login);
  }
  const profile = await getProfile(asDbClient(createAdminSupabaseClient()), user.id);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${profile.displayName}`}
        description="Owner operations overview"
        actions={
          <Link
            href={ROUTES.owner.resellersInvite}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Invite Reseller
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Resellers" value="0" />
        <StatCard label="Active Orders" value="0" />
        <StatCard label="Total Revenue (USDT)" value="0.00" />
        <StatCard label="Pending Approvals" value="0" />
      </div>
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-gray-400">Recent activity</h2>
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-6 py-12 text-center text-sm text-gray-400">
          No activity yet
        </div>
      </section>
    </>
  );
}
