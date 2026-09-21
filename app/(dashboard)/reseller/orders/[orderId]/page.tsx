/**
 * @file app/(dashboard)/reseller/orders/[orderId]/page.tsx
 *
 * Reseller order detail — limited view without financial internals.
 *
 * @module Dashboard
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { TrackBadge } from '@/components/orders/track-badge';
import { PageHeader } from '@/components/ui/page-header';
import { asDbClient } from '@/lib/auth/session';
import { formatUsdt } from '@/lib/money';
import { ROUTES } from '@/lib/navigation';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCustomerById } from '@/modules/bots';
import { getProduct } from '@/modules/catalog';
import { getProfile } from '@/modules/identity';
import { getOrder, getOrderEvents } from '@/modules/orders';
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
    const product = await getProduct(db, order.productId);
    const events = await getOrderEvents(db, order.id);
    let customerLabel = '—';
    if (order.customerId) {
      try {
        const customer = await getCustomerById(db, order.customerId);
        customerLabel = customer.username ? `@${customer.username}` : customer.telegramUserId;
      } catch {
        customerLabel = '—';
      }
    }

    return (
      <>
        <PageHeader
          title={`Order ${order.id.slice(0, 8).toUpperCase()}`}
          actions={
            <Link href={ROUTES.reseller.orders} className="text-sm text-[var(--accent-soft)]">
              Back to orders
            </Link>
          }
        />
        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-lg font-medium text-[var(--text-1)]">Order summary</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--text-2)]">Product</dt>
              <dd>{product.title}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-2)]">Amount</dt>
              <dd>{formatUsdt(order.quotedRetailPriceMinor)}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-2)]">Created</dt>
              <dd>{order.createdAt.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-2)]">Customer</dt>
              <dd>{customerLabel}</dd>
            </div>
          </dl>
        </section>
        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-sm text-[var(--text-2)]">Payment</p>
            <TrackBadge status={order.paymentStatus} />
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-sm text-[var(--text-2)]">Funding</p>
            <TrackBadge status={order.fundingStatus} />
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-sm text-[var(--text-2)]">Fulfillment</p>
            <TrackBadge status={order.fulfillmentStatus} />
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-sm text-[var(--text-2)]">Delivery</p>
            <TrackBadge status={order.deliveryStatus} />
          </div>
        </section>
        <section className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-lg font-medium text-[var(--text-1)]">Timeline</h2>
          <ol className="mt-3 space-y-2 text-sm text-[var(--text-2)]">
            {[...events]
              .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
              .map((event) => (
                <li key={event.id}>
                  {event.createdAt.toLocaleString()} — {event.track}: {event.fromStatus ?? '∅'} → {event.toStatus}
                </li>
              ))}
          </ol>
        </section>
      </>
    );
  } catch {
    notFound();
  }
}
