/**
 * @file app/(dashboard)/reseller/orders/page.tsx
 *
 * Reseller order list with payment, funding, and fulfillment badges.
 *
 * @module Dashboard
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { asDbClient } from '@/lib/auth/session';
import { formatUsdt } from '@/lib/money';
import { ROUTES } from '@/lib/navigation';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getProduct } from '@/modules/catalog';
import { getProfile } from '@/modules/identity';
import { listOrders, type Order } from '@/modules/orders';
import { getTenantByUserId } from '@/modules/tenants';

type OrderTableRow = {
  readonly order: Order;
  readonly productTitle: string;
};

function badge(text: string): JSX.Element {
  return (
    <span className="inline-flex rounded-full bg-gray-800 px-2.5 py-0.5 text-xs capitalize text-gray-300">
      {text.replaceAll('_', ' ')}
    </span>
  );
}

export default async function ResellerOrdersPage(): Promise<JSX.Element> {
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
  const orders = await listOrders(db, { tenantId: tenant.id, limit: 100 });
  const rows: OrderTableRow[] = await Promise.all(
    orders.map(async (order) => ({
      order,
      productTitle: (await getProduct(db, order.productId)).title,
    })),
  );

  const columns: ReadonlyArray<DataTableColumn<OrderTableRow>> = [
    {
      key: 'ref',
      header: 'Order ref',
      render: (row) => (
        <Link href={`${ROUTES.reseller.orders}/${row.order.id}`} className="text-indigo-400 hover:text-indigo-300">
          {row.order.id.slice(0, 8).toUpperCase()}
        </Link>
      ),
    },
    { key: 'product', header: 'Product', render: (row) => row.productTitle },
    { key: 'customer', header: 'Customer', render: (row) => row.order.customerId?.slice(0, 8) ?? '—' },
    { key: 'amount', header: 'Amount', render: (row) => formatUsdt(row.order.quotedRetailPriceMinor) },
    { key: 'payment', header: 'Payment', render: (row) => badge(row.order.paymentStatus) },
    { key: 'funding', header: 'Funding', render: (row) => badge(row.order.fundingStatus) },
    { key: 'fulfillment', header: 'Fulfillment', render: (row) => badge(row.order.fulfillmentStatus) },
    {
      key: 'created',
      header: 'Created',
      render: (row) => row.order.createdAt.toLocaleString(),
    },
  ];

  return (
    <>
      <PageHeader title="Orders" description="Customer orders from your Telegram bot" />
      <DataTable
        columns={columns}
        rows={rows}
        emptyMessage="No orders yet."
        rowKey={(row) => row.order.id}
      />
    </>
  );
}
