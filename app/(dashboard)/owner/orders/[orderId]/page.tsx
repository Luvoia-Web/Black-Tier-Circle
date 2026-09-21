/**
 * @file app/(dashboard)/owner/orders/[orderId]/page.tsx
 *
 * Owner order detail with four tracks, timeline, and support actions.
 *
 * @module Dashboard
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OrderActions } from '@/components/orders/order-actions';
import { TrackBadge } from '@/components/orders/track-badge';
import { PageHeader } from '@/components/ui/page-header';
import { asDbClient } from '@/lib/auth/session';
import { formatUsdt } from '@/lib/money';
import { ROUTES } from '@/lib/navigation';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { getCustomerById } from '@/modules/bots';
import { getProduct } from '@/modules/catalog';
import { getOrderFulfillmentStatus, supplierRefFromAttempts } from '@/modules/fulfillment';
import { getOrder, getOrderEvents } from '@/modules/orders';
import { getPaymentStatus } from '@/modules/payments';

type PageProps = {
  readonly params: { readonly orderId: string };
};

export default async function OwnerOrderDetailPage({ params }: PageProps): Promise<JSX.Element> {
  const db = asDbClient(createAdminSupabaseClient());
  try {
    const order = await getOrder(db, params.orderId);
    const product = await getProduct(db, order.productId);
    const payment = await getPaymentStatus(db, order.id);
    const fulfillment = await getOrderFulfillmentStatus(db, order.id);
    const events = await getOrderEvents(db, order.id);
    let customerLabel = '—';
    if (order.customerId) {
      try {
        const customer = await getCustomerById(db, order.customerId);
        customerLabel = customer.username ? `@${customer.username}` : customer.telegramUserId;
      } catch {
        customerLabel = order.customerId.slice(0, 8);
      }
    }

    return (
      <>
        <PageHeader
          title={`Order ${order.id.slice(0, 8).toUpperCase()}`}
          description={product.title}
          actions={
            <Link href={ROUTES.owner.orders} className="text-sm text-[var(--accent-soft)] hover:text-[var(--accent)]">
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
              <dt className="text-[var(--text-2)]">Channel</dt>
              <dd>{order.channel}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-2)]">Customer</dt>
              <dd>{customerLabel}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-2)]">Retail</dt>
              <dd>{formatUsdt(order.quotedRetailPriceMinor)}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-2)]">Wholesale</dt>
              <dd>{formatUsdt(order.quotedWholesalePriceMinor)}</dd>
            </div>
          </dl>
        </section>
        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-lg font-medium text-[var(--text-1)]">Payment</h2>
            <p className="mt-2">
              <TrackBadge status={order.paymentStatus} />
            </p>
            <p className="mt-2 text-sm text-[var(--text-2)]">
              Method: {order.paymentMethod ?? '—'} · Claim:{' '}
              {payment.claim?.verifiedAt
                ? payment.claim.verifiedAt.toLocaleString()
                : 'not verified'}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-lg font-medium text-[var(--text-1)]">Funding</h2>
            <p className="mt-2">
              <TrackBadge status={order.fundingStatus} />
            </p>
            <p className="mt-2 text-sm text-[var(--text-2)]">
              Reserved wholesale: {formatUsdt(order.quotedWholesalePriceMinor)}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-lg font-medium text-[var(--text-1)]">Fulfillment</h2>
            <p className="mt-2">
              <TrackBadge status={fulfillment.fulfillment} />
            </p>
            <ul className="mt-3 space-y-1 text-sm text-[var(--text-2)]">
              {fulfillment.fulfillmentAttempts.map((attempt) => (
                <li key={attempt.id}>
                  #{attempt.attemptNumber} {attempt.method} — {attempt.status}
                  {attempt.error ? ` (${attempt.error})` : ''}
                </li>
              ))}
              {fulfillment.fulfillmentAttempts.length === 0 ? <li>No attempts yet.</li> : null}
            </ul>
            {supplierRefFromAttempts(fulfillment.fulfillmentAttempts) ? (
              <p className="mt-3 text-sm text-[var(--text-2)]">
                Supplier ref: {supplierRefFromAttempts(fulfillment.fulfillmentAttempts)}{' '}
                <Link
                  href={ROUTES.owner.supplierOrder(order.id)}
                  className="text-[var(--accent-soft)] hover:text-[var(--accent)]"
                >
                  Open supplier detail
                </Link>
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-lg font-medium text-[var(--text-1)]">Delivery</h2>
            <p className="mt-2">
              <TrackBadge status={fulfillment.delivery} />
            </p>
            <ul className="mt-3 space-y-1 text-sm text-[var(--text-2)]">
              {fulfillment.deliveryAttempts.map((attempt) => (
                <li key={attempt.id}>
                  #{attempt.attemptNumber} {attempt.channel} — {attempt.status}
                  {attempt.error ? ` (${attempt.error})` : ''}
                </li>
              ))}
              {fulfillment.deliveryAttempts.length === 0 ? <li>No attempts yet.</li> : null}
            </ul>
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
                  {event.note ? ` (${event.note})` : ''}
                </li>
              ))}
          </ol>
        </section>
        <OrderActions
          orderId={order.id}
          fulfillmentStatus={order.fulfillmentStatus}
          deliveryStatus={order.deliveryStatus}
          paymentStatus={order.paymentStatus}
        />
      </>
    );
  } catch {
    notFound();
  }
}
