/**
 * @file app/(dashboard)/owner/page.tsx
 *
 * Owner dashboard home with live reseller, order, and revenue stats.
 *
 * @module Dashboard
 */

import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { formatUsdt } from '@/lib/money';
import { ROUTES } from '@/lib/navigation';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { asDbClient } from '@/lib/auth/session';
import { listProducts } from '@/modules/catalog';
import { getProfile } from '@/modules/identity';
import { listOrders } from '@/modules/orders';
import { listTenants } from '@/modules/tenants';
import { redirect } from 'next/navigation';

export default async function OwnerDashboardPage(): Promise<JSX.Element> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    redirect(ROUTES.login);
  }
  const db = asDbClient(createAdminSupabaseClient());
  const profile = await getProfile(db, user.id);
  const publishedProducts = await listProducts(db, {
    status: 'published',
  });
  const tenants = await listTenants(db);
  const activeResellers = tenants.filter((tenant) => tenant.status === 'active').length;
  const orders = await listOrders(db, { limit: 200 });
  const activeOrders = orders.filter((order) => {
    const terminal =
      order.fulfillmentStatus === 'canceled' ||
      order.fulfillmentStatus === 'failed' ||
      (order.fulfillmentStatus === 'ready' && order.deliveryStatus === 'sent');
    return !terminal;
  }).length;
  const pendingManual = orders.filter((order) => order.fulfillmentStatus === 'manual_pending').length;
  const revenueMinor = orders
    .filter((order) => order.fulfillmentStatus === 'ready')
    .reduce((sum, order) => sum + order.quotedWholesalePriceMinor, 0n);

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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Resellers" value={String(activeResellers)} />
        <StatCard label="Total Products" value={String(publishedProducts.length)} />
        <StatCard label="Active Orders" value={String(activeOrders)} />
        <StatCard label="Pending Manual" value={String(pendingManual)} />
        <StatCard label="Total Revenue (USDT)" value={formatUsdt(revenueMinor).replace(' USDT', '')} />
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
