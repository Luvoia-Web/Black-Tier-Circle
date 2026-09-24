/**
 * @file app/(dashboard)/owner/supplier/[orderId]/page.tsx
 *
 * Supplier order detail with reconciliation history and manual actions.
 *
 * @module Dashboard
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SupplierOrderActions } from '@/components/supplier/supplier-order-actions';
import { TrackBadge } from '@/components/orders/track-badge';
import { PageHeader } from '@/components/ui/page-header';
import { asDbClient } from '@/lib/auth/session';
import { formatUsdt } from '@/lib/money';
import { ROUTES } from '@/lib/navigation';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { getProduct } from '@/modules/catalog';
import { getOrder, getOrderEvents } from '@/modules/orders';
import { getOrderFulfillmentStatus, supplierRefFromAttempts } from '@/modules/fulfillment';

type PageProps = {
  readonly params: { readonly orderId: string };
};

function maskDeliveryData(value: string | null): string {
  if (!value) {
    return '—';
  }
  if (value.length <= 10) {
    return `${value.slice(0, 2)}…`;
  }
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export default async function OwnerSupplierOrderPage({ params }: PageProps): Promise<JSX.Element> {
  const db = asDbClient(createAdminSupabaseClient());
  try {
    const order = await getOrder(db, params.orderId);
    const product = await getProduct(db, order.productId);
    const fulfillment = await getOrderFulfillmentStatus(db, order.id);
    const events = await getOrderEvents(db, order.id);
    const supplierRef = supplierRefFromAttempts(fulfillment.fulfillmentAttempts);
    const latestAttempt = fulfillment.fulfillmentAttempts[0];
    const canAct =
      order.fulfillmentStatus === 'outcome_unknown' ||
      order.fulfillmentStatus === 'supplier_pending' ||
      order.fulfillmentStatus === 'failed';
    const deliveryResult = fulfillment.deliveryAttempts.find((item) => item.result)?.result ?? null;

    return (
      <>
        <PageHeader
          title={`Supplier order ${order.id.slice(0, 8).toUpperCase()}`}
          description={product.title}
          actions={
            <Link href={ROUTES.owner.supplierOrders} className="text-sm text-[var(--accent-soft)] hover:text-[var(--accent)]">
              Back to supplier
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
              <dt className="text-[var(--text-2)]">Retail</dt>
              <dd>{formatUsdt(order.quotedRetailPriceMinor)}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-2)]">Fulfillment</dt>
              <dd>
                <TrackBadge status={order.fulfillmentStatus} />
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text-2)]">Delivery</dt>
              <dd>
                <TrackBadge status={order.deliveryStatus} />
              </dd>
            </div>
          </dl>
        </section>
        <section className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-lg font-medium text-[var(--text-1)]">Supplier fulfillment</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--text-2)]">Supplier order ID</dt>
              <dd>{supplierRef ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-2)]">Submitted at</dt>
              <dd>{latestAttempt ? latestAttempt.startedAt.toLocaleString() : '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-2)]">Last status</dt>
              <dd>{latestAttempt?.status ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-2)]">Delivery data</dt>
              <dd>{maskDeliveryData(deliveryResult)}</dd>
            </div>
          </dl>
        </section>
        <section className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-lg font-medium text-[var(--text-1)]">Reconciliation history</h2>
          <ol className="mt-3 space-y-2 text-sm text-[var(--text-2)]">
            {events
              .filter((event) => event.track === 'fulfillment')
              .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
              .map((event) => (
                <li key={event.id}>
                  {event.createdAt.toLocaleString()} — {event.fromStatus ?? '∅'} → {event.toStatus}
                  {event.note ? ` (${event.note})` : ''}
                </li>
              ))}
          </ol>
        </section>
        <section className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="mb-3 text-lg font-medium text-[var(--text-1)]">Manual actions</h2>
          <SupplierOrderActions orderId={order.id} canAct={canAct} />
        </section>
      </>
    );
  } catch {
    notFound();
  }
}
