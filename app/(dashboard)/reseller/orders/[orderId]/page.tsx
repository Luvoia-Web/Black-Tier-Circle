/**
 * @file app/(dashboard)/reseller/orders/[orderId]/page.tsx
 *
 * Reseller order detail stub (fulfillment in Phase 6).
 *
 * @module Dashboard
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ComingSoon } from '@/components/coming-soon';
import { PageHeader } from '@/components/ui/page-header';
import { asDbClient } from '@/lib/auth/session';
import { ROUTES } from '@/lib/navigation';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getProfile } from '@/modules/identity';
import { getOrder } from '@/modules/orders';
import { getTenantByUserId } from '@/modules/tenants';

type PageProps = {
  readonly params: { readonly orderId: string };
};

export default async function ResellerOrderDetailPage({ params }: PageProps): Promise<JSX.Element> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    redirect(ROUTES.login);
  }
  const db = asDbClient(createAdminSupabaseClient());
  const profile = await getProfile(db, user.id);
  if (profile.role !== 'reseller') {
    redirect(ROUTES.owner.home);
  }
  const tenant = await getTenantByUserId(db, user.id);
  try {
    const order = await getOrder(db, params.orderId);
    if (order.tenantId !== tenant.id) {
      notFound();
    }
    return (
      <>
        <PageHeader
          title={`Order ${order.id.slice(0, 8).toUpperCase()}`}
          actions={
            <Link href={ROUTES.reseller.orders} className="text-sm text-indigo-400">
              Back to orders
            </Link>
          }
        />
        <ComingSoon title="Order fulfillment" />
      </>
    );
  } catch {
    notFound();
  }
}
