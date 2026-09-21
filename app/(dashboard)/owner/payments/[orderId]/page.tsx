/**
 * @file app/(dashboard)/owner/payments/[orderId]/page.tsx
 *
 * Owner payment detail with claim evidence and manual override.
 *
 * @module Dashboard
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PaymentOverrideForm } from '@/components/payments/override-form';
import { PageHeader } from '@/components/ui/page-header';
import { asDbClient } from '@/lib/auth/session';
import { formatUsdt } from '@/lib/money';
import { ROUTES } from '@/lib/navigation';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { getProduct } from '@/modules/catalog';
import { getOrder, getOrderEvents } from '@/modules/orders';
import { getPaymentStatus } from '@/modules/payments';

type PageProps = {
  readonly params: { readonly orderId: string };
};

function maskRef(value: string | null): string {
  if (!value) {
    return '—';
  }
  if (value.length <= 8) {
    return '********';
  }
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export default async function OwnerPaymentDetailPage({ params }: PageProps): Promise<JSX.Element> {
  const db = asDbClient(createAdminSupabaseClient());
  try {
    const order = await getOrder(db, params.orderId);
    const product = await getProduct(db, order.productId);
    const status = await getPaymentStatus(db, order.id);
    const events = await getOrderEvents(db, order.id);
    const canOverride =
      order.paymentStatus === 'pending_verification' || order.paymentStatus === 'failed';

    return (
      <>
        <PageHeader
          title={`Payment ${order.id.slice(0, 8).toUpperCase()}`}
          description={product.title}
          actions={
            <Link href={ROUTES.owner.payments} className="text-sm text-indigo-400 hover:text-indigo-300">
              Back to payments
            </Link>
          }
        />
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-lg font-medium text-gray-100">Order summary</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-400">Amount</dt>
              <dd>{formatUsdt(order.quotedRetailPriceMinor)}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Channel</dt>
              <dd>{order.channel}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Payment</dt>
              <dd>{order.paymentStatus}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Fulfillment</dt>
              <dd>{order.fulfillmentStatus}</dd>
            </div>
          </dl>
        </section>
        <section className="mt-6 rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-lg font-medium text-gray-100">Payment claim</h2>
          {status.claim ? (
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-400">Method</dt>
                <dd>{status.claim.paymentMethod}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Evidence</dt>
                <dd>{maskRef(status.claim.binanceOrderId ?? status.claim.txHash)}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Result</dt>
                <dd>
                  {status.claim.verifiedAt
                    ? 'Verified'
                    : status.claim.rejectedAt
                      ? `Rejected (${status.claim.rejectReason ?? 'unknown'})`
                      : 'Pending'}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-gray-400">No claim submitted yet.</p>
          )}
        </section>
        <section className="mt-6 rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-lg font-medium text-gray-100">Status timeline</h2>
          <ol className="mt-3 space-y-2 text-sm text-gray-300">
            {events.map((event) => (
              <li key={event.id}>
                {event.createdAt.toLocaleString()} — {event.track}: {event.fromStatus ?? '∅'} → {event.toStatus}
                {event.note ? ` (${event.note})` : ''}
              </li>
            ))}
          </ol>
        </section>
        {canOverride ? <PaymentOverrideForm orderId={order.id} /> : null}
      </>
    );
  } catch {
    notFound();
  }
}
