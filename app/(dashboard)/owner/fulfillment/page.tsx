/**
 * @file app/(dashboard)/owner/fulfillment/page.tsx
 *
 * Owner fulfillment overview with manual pending queue.
 *
 * @module Dashboard
 */

import { MarkFulfilledButton } from '@/components/orders/mark-fulfilled-button';
import { TrackBadge } from '@/components/orders/track-badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { asDbClient } from '@/lib/auth/session';
import { formatUsdt } from '@/lib/money';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { getProduct } from '@/modules/catalog';
import { isManualFulfillmentOverdue } from '@/modules/fulfillment';
import { listOrders, type Order } from '@/modules/orders';
import Link from 'next/link';
import { ROUTES } from '@/lib/navigation';

type ManualRow = {
  readonly order: Order;
  readonly productTitle: string;
};

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export default async function OwnerFulfillmentPage(): Promise<JSX.Element> {
  const db = asDbClient(createAdminSupabaseClient());
  const orders = await listOrders(db, { limit: 200 });
  const today = startOfToday();
  const queued = orders.filter((order) => order.fulfillmentStatus === 'queued').length;
  const manualPending = orders.filter((order) => order.fulfillmentStatus === 'manual_pending');
  const inProgress = orders.filter((order) => order.fulfillmentStatus === 'supplier_pending').length;
  const completedToday = orders.filter(
    (order) => order.fulfillmentStatus === 'ready' && order.updatedAt >= today,
  ).length;
  const failedToday = orders.filter(
    (order) => order.fulfillmentStatus === 'failed' && order.updatedAt >= today,
  ).length;

  const sortedManual = [...manualPending].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  const rows: ManualRow[] = await Promise.all(
    sortedManual.map(async (order) => ({
      order,
      productTitle: (await getProduct(db, order.productId)).title,
    })),
  );

  const columns: ReadonlyArray<DataTableColumn<ManualRow>> = [
    {
      key: 'ref',
      header: 'Order',
      render: (row) => (
        <Link href={ROUTES.owner.orderDetail(row.order.id)} className="text-[var(--accent-soft)] hover:text-[var(--accent)]">
          {row.order.id.slice(0, 8).toUpperCase()}
        </Link>
      ),
    },
    { key: 'product', header: 'Product', render: (row) => row.productTitle },
    { key: 'amount', header: 'Amount', render: (row) => formatUsdt(row.order.quotedRetailPriceMinor) },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <TrackBadge status={row.order.fulfillmentStatus} />,
    },
    {
      key: 'age',
      header: 'Age',
      render: (row) => (
        <span>
          {row.order.createdAt.toLocaleString()}
          {isManualFulfillmentOverdue(row.order.createdAt) ? (
            <span className="ml-2 text-xs text-[var(--amber)]">Reminder due</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => <MarkFulfilledButton orderId={row.order.id} />,
    },
  ];

  return (
    <>
      <PageHeader title="Fulfillment" description="Queued work and manual deliveries" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Queued" value={String(queued)} />
        <StatCard label="Manual pending" value={String(manualPending.length)} />
        <StatCard label="In progress" value={String(inProgress)} />
        <StatCard label="Completed today" value={String(completedToday)} />
        <StatCard label="Failed today" value={String(failedToday)} />
      </div>
      <h2 className="mb-3 mt-8 text-sm font-medium text-[var(--text-2)]">Manual pending (oldest first)</h2>
      <DataTable columns={columns} rows={rows} emptyMessage="No manual orders waiting." rowKey={(row) => row.order.id} />
    </>
  );
}
