/**
 * @file app/(dashboard)/owner/supplier/page.tsx
 *
 * Owner supplier monitoring: mode, health, outcome_unknown queue, recent orders.
 *
 * @module Dashboard
 */

import Link from 'next/link';
import { ForceReconcileButton } from '@/components/supplier/force-reconcile-button';
import { SupplierHealthBadge } from '@/components/supplier/supplier-health-badge';
import { TrackBadge } from '@/components/orders/track-badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { asDbClient } from '@/lib/auth/session';
import { ROUTES } from '@/lib/navigation';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { getSupplierModeLabel } from '@/lib/supplier-config';
import { getProduct } from '@/modules/catalog';
import { getOrderEvents, listOrders, type Order } from '@/modules/orders';
import { getOrderFulfillmentStatus, supplierRefFromAttempts } from '@/modules/fulfillment';

type SupplierRow = {
  readonly order: Order;
  readonly productTitle: string;
  readonly supplierOrderId: string;
  readonly lastCheck: string;
};

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatAge(from: Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - from.getTime()) / 60000));
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

async function toRow(db: ReturnType<typeof asDbClient>, order: Order): Promise<SupplierRow> {
  const product = await getProduct(db, order.productId);
  const snapshot = await getOrderFulfillmentStatus(db, order.id);
  const events = await getOrderEvents(db, order.id);
  const last = events[0];
  return {
    order,
    productTitle: product.title,
    supplierOrderId: supplierRefFromAttempts(snapshot.fulfillmentAttempts) ?? '—',
    lastCheck: last ? last.createdAt.toLocaleString() : '—',
  };
}

export default async function OwnerSupplierPage(): Promise<JSX.Element> {
  const db = asDbClient(createAdminSupabaseClient());
  const orders = await listOrders(db, { limit: 200 });
  const today = startOfToday();

  const pending = orders.filter((order) => order.fulfillmentStatus === 'supplier_pending');
  const unknown = orders.filter((order) => order.fulfillmentStatus === 'outcome_unknown');
  const completedToday = orders.filter(
    (order) => order.fulfillmentStatus === 'ready' && order.updatedAt >= today,
  ).length;
  const failedToday = orders.filter(
    (order) => order.fulfillmentStatus === 'failed' && order.updatedAt >= today,
  ).length;

  const unknownRows = await Promise.all(unknown.map((order) => toRow(db, order)));
  const recentSupplier = orders.filter((order) =>
    ['supplier_pending', 'outcome_unknown', 'ready', 'failed'].includes(order.fulfillmentStatus),
  );
  const recentRows = await Promise.all(recentSupplier.slice(0, 40).map((order) => toRow(db, order)));

  const unknownColumns: ReadonlyArray<DataTableColumn<SupplierRow>> = [
    {
      key: 'ref',
      header: 'Order ID',
      render: (row) => (
        <Link href={ROUTES.owner.supplierOrder(row.order.id)} className="text-[var(--accent-soft)] hover:text-[var(--accent)]">
          {row.order.id.slice(0, 8).toUpperCase()}
        </Link>
      ),
    },
    { key: 'product', header: 'Product', render: (row) => row.productTitle },
    { key: 'age', header: 'Age', render: (row) => formatAge(row.order.updatedAt) },
    { key: 'supplier', header: 'Supplier order ID', render: (row) => row.supplierOrderId },
    { key: 'check', header: 'Last check', render: (row) => row.lastCheck },
    {
      key: 'action',
      header: 'Action',
      render: (row) => <ForceReconcileButton orderId={row.order.id} />,
    },
  ];

  const recentColumns: ReadonlyArray<DataTableColumn<SupplierRow>> = [
    {
      key: 'ref',
      header: 'Order ID',
      render: (row) => (
        <Link href={ROUTES.owner.supplierOrder(row.order.id)} className="text-[var(--accent-soft)] hover:text-[var(--accent)]">
          {row.order.id.slice(0, 8).toUpperCase()}
        </Link>
      ),
    },
    { key: 'product', header: 'Product', render: (row) => row.productTitle },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <TrackBadge status={row.order.fulfillmentStatus} />,
    },
    { key: 'supplier', header: 'Supplier ref', render: (row) => row.supplierOrderId },
    { key: 'updated', header: 'Completed at', render: (row) => row.order.updatedAt.toLocaleString() },
  ];

  return (
    <>
      <PageHeader
        title="Supplier"
        description="External supplier connector monitoring"
        actions={
          <div className="flex flex-col items-end gap-1">
            <span className="rounded-full bg-[var(--bg-raised)] px-3 py-1 text-sm text-[var(--text-1)]">{getSupplierModeLabel()}</span>
            <SupplierHealthBadge />
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Supplier pending" value={String(pending.length)} />
        <StatCard label="Outcome unknown" value={String(unknown.length)} />
        <StatCard label="Completed today" value={String(completedToday)} />
        <StatCard label="Failed today" value={String(failedToday)} />
      </div>
      <h2 className="mb-3 mt-8 text-sm font-medium text-[var(--amber)]">Outcome unknown (needs attention)</h2>
      <DataTable
        columns={unknownColumns}
        rows={unknownRows}
        emptyMessage="No orders waiting on supplier reconciliation."
        rowKey={(row) => row.order.id}
      />
      <h2 className="mb-3 mt-8 text-sm font-medium text-[var(--text-2)]">Recent supplier orders</h2>
      <DataTable
        columns={recentColumns}
        rows={recentRows}
        emptyMessage="No supplier orders yet."
        rowKey={(row) => `recent-${row.order.id}`}
      />
    </>
  );
}
