/**
 * @file app/(dashboard)/reseller/page.tsx
 *
 * Reseller dashboard home with pending-approval banner and placeholder stats.
 *
 * @module Dashboard
 */

import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { ROUTES } from '@/lib/navigation';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { asDbClient } from '@/lib/auth/session';
import { getProfile } from '@/modules/identity';
import { redirect } from 'next/navigation';

export default async function ResellerDashboardPage(): Promise<JSX.Element> {
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
      <PageHeader title={`Welcome back, ${profile.displayName}`} description="Reseller operations overview" />
      {profile.status === 'pending' ? (
        <div className="mb-6 rounded-md border border-yellow-600/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
          Your account is pending owner approval. You can explore the dashboard but features will be unlocked once
          approved.
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Wallet Balance (USDT)" value="0.00" />
        <StatCard label="Active Orders" value="0" />
        <StatCard label="Total Sales" value="0" />
        <StatCard label="Products Listed" value="0" />
      </div>
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-gray-400">Recent orders</h2>
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-6 py-12 text-center text-sm text-gray-400">
          No activity yet
        </div>
      </section>
    </>
  );
}
