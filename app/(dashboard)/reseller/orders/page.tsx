/**
 * @file app/(dashboard)/reseller/orders/page.tsx
 *
 * Reseller order list with payment, fulfillment, and delivery badges.
 *
 * @module Dashboard
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TrackBadge } from '@/components/orders/track-badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { asDbClient } from '@/lib/auth/session';
import { formatUsdt } from '@/lib/money';
import { ROUTES } from '@/lib/navigation';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCustomerById } from '@/modules/bots';
import { getProduct } from '@/modules/catalog';
import { matchesResellerOrderTab } from '@/modules/fulfillment';
import { getProfile } from '@/modules/identity';
import { listOrders, type Order } from '@/modules/orders';
import { getTenantByUserId } from '@/modules/tenants';

type OrderTableRow = {
  readonly order: Order;
  readonly productTitle: string;
  readonly customerLabel: string;
};

type PageProps = {
  readonly searchParams?: { readonly tab?: string };
};

export default async function ResellerOrdersPage({ searchParams }: PageProps): Promise<JSX.Element> {
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
  const tab =
    searchParams?.tab === 'completed' || searchParams?.tab === 'failed' ? searchParams.tab : 'active';
  const orders = await listOrders(db, { tenantId: tenant.id, limit: 100 });
  const filtered = orders.filter((order) => matchesResellerOrderTab(order, tab));
  const rows: OrderTableRow[] = await Promise.all(
    filtered.map(async (order) => {
      let customerLabel = '—';
      if (order.customerId) {
        try {
          const customer = await getCustomerById(db, order.customerId);
          customerLabel = customer.username ? `@${customer.username}` : customer.telegramUserId;
        } catch {
          customerLabel = order.customerId.slice(0, 8);
        }
      }
      return {
        order,
        productTitle: (await getProduct(db, order.productId)).title,
        customerLabel,
      };
    }),
  );

  const columns: ReadonlyArray<DataTableColumn<OrderTableRow>> = [
    {
      key: 'ref',
      header: 'Order ref',
      render: (row) => (
        <Link href={ROUTES.reseller.orderDetail(row.order.id)} className="text-indigo-400 hover:text-indigo-300">
          {row.order.id.slice(0, 8).toUpperCase()}
        </Link>
      ),
    },
    { key: 'product', header: 'Product', render: (row) => row.productTitle },
    { key: 'customer', header: 'Customer Telegram', render: (row) => row.customerLabel },
    { key: 'amount', header: 'Amount', render: (row) => formatUsdt(row.order.quotedRetailPriceMinor) },
    { key: 'payment', header: 'Payment', render: (row) => <TrackBadge status={row.order.paymentStatus} /> },
    { key: 'fulfillment', header: 'Fulfillment', render: (row) => <TrackBadge status={row.order.fulfillmentStatus} /> },
    { key: 'delivery', header: 'Delivery', render: (row) => <TrackBadge status={row.order.deliveryStatus} /> },
    {
      key: 'created',
      header: 'Created',
      render: (row) => row.order.createdAt.toLocaleString(),
    },
  ];

  const tabs: ReadonlyArray<{ id: 'active' | 'completed' | 'failed'; label: string }> = [
    { id: 'active', label: 'Active' },
    { id: 'completed', label: 'Completed' },
    { id: 'failed', label: 'Failed' },
  ];

  return (
    <>
      <PageHeader title="Orders" description="Customer orders from your Telegram bot" />
      <div className="mb-4 flex gap-2">
        {tabs.map((item) => (
          <Link
            key={item.id}
            href={`${ROUTES.reseller.orders}?tab=${item.id}`}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === item.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <DataTable columns={columns} rows={rows} emptyMessage="No orders yet." rowKey={(row) => row.order.id} />
    </>
  );
}
